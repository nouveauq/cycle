#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


APP_ID = "cycle-together"
BACKUP_TYPE = "cycle-together-backup"
ROOT_DIR = Path(__file__).resolve().parent


def load_dotenv_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_dotenv_file(ROOT_DIR / ".env")

STATIC_DIR = ROOT_DIR / "static"
DATA_DIR = Path(os.environ.get("DATA_DIR", ROOT_DIR / "data"))
DB_PATH = Path(os.environ.get("DB_PATH", DATA_DIR / "cycle_together.sqlite3"))
BOT_TOKEN = os.environ.get("BOT_TOKEN", "").strip()
PUBLIC_URL = (os.environ.get("PUBLIC_URL") or os.environ.get("RENDER_EXTERNAL_URL", "")).strip().rstrip("/")
BOT_USERNAME = os.environ.get("BOT_USERNAME", "").strip().lstrip("@")
DEV_MODE = os.environ.get("DEV_MODE", "").lower() in {"1", "true", "yes", "on"}
PORT = int(os.environ.get("PORT", "8000"))
MAX_MEMBERS = int(os.environ.get("MAX_MEMBERS", "2"))
MAX_BODY_BYTES = 2 * 1024 * 1024
AUTH_TTL_SECONDS = int(os.environ.get("AUTH_TTL_SECONDS", str(7 * 24 * 60 * 60)))
INVITE_TTL_DAYS = int(os.environ.get("INVITE_TTL_DAYS", "30"))

FLOW_KEYS = {"spotting", "light", "medium", "heavy"}
SYMPTOM_KEYS = {
    "cramps",
    "headache",
    "bloating",
    "breasts",
    "acne",
    "cravings",
    "insomnia",
    "irritability",
    "anxiety",
    "high-libido",
    "low-libido",
    "sex",
    "spotting",
}
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class ApiError(Exception):
    def __init__(self, status: int, message: str, code: str | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code or "api_error"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().replace(microsecond=0).isoformat().replace("+00:00", "Z")


def iso_from_datetime(value: datetime) -> str:
    return value.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso_datetime(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def json_dumps(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def pretty_json(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, indent=2).encode("utf-8")


def clamp_number(value: object, minimum: int, maximum: int, fallback: int) -> int:
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError):
        return fallback
    return min(maximum, max(minimum, number))


def is_iso_date(value: object) -> bool:
    if not isinstance(value, str) or not ISO_DATE_RE.match(value):
        return False
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        return False
    return True


def compare_dates(left: str, right: str) -> int:
    if left == right:
        return 0
    return -1 if left < right else 1


def safe_text(value: object, fallback: str = "", limit: int = 4000) -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text[:limit]


def clean_record_id(value: object, prefix: str) -> str:
    text = safe_text(value, "", 120)
    if text and re.match(r"^[A-Za-z0-9_.:-]{1,120}$", text):
        return text
    return f"{prefix}-{secrets.token_urlsafe(8)}"


def default_snapshot() -> dict:
    return {
        "settings": {
            "cycleLength": 28,
            "periodLength": 5,
            "lutealLength": 14,
        },
        "periods": {},
        "logs": {},
    }


def list_records(value: object) -> list:
    if isinstance(value, dict):
        return list(value.values())
    if isinstance(value, list):
        return value
    return []


def normalize_settings(raw: object) -> dict:
    settings = raw if isinstance(raw, dict) else {}
    return {
        "cycleLength": clamp_number(settings.get("cycleLength"), 20, 45, 28),
        "periodLength": clamp_number(settings.get("periodLength"), 2, 10, 5),
        "lutealLength": clamp_number(settings.get("lutealLength"), 10, 18, 14),
    }


def normalize_period_records(records: object, user: dict | None = None) -> dict:
    user = user or {}
    normalized: dict[str, dict] = {}
    for index, record in enumerate(list_records(records)):
        if not isinstance(record, dict):
            continue
        start_date = safe_text(record.get("startDate"), "", 10)
        end_date = safe_text(record.get("endDate"), "", 10)
        if not is_iso_date(start_date) or not is_iso_date(end_date):
            continue
        if compare_dates(start_date, end_date) > 0:
            start_date, end_date = end_date, start_date
        record_id = clean_record_id(record.get("id") or f"period-import-{index}", "period")
        if record_id in normalized:
            record_id = f"{record_id}-{index}"
        flow = safe_text(record.get("flow"), "medium", 24)
        normalized[record_id] = {
            "id": record_id,
            "startDate": start_date,
            "endDate": end_date,
            "flow": flow if flow in FLOW_KEYS else "medium",
            "note": safe_text(record.get("note"), "", 4000),
            "authorName": safe_text(record.get("authorName"), user.get("name", "Участник"), 120),
            "authorAddr": safe_text(record.get("authorAddr"), user.get("addr", "telegram"), 160),
            "updatedAt": safe_text(record.get("updatedAt"), iso_now(), 64),
        }
    return dict(sorted(normalized.items(), key=lambda item: item[1]["startDate"]))


def normalize_symptoms(values: object) -> list[str]:
    if not isinstance(values, list):
        return []
    return sorted({safe_text(value, "", 80) for value in values if safe_text(value, "", 80) in SYMPTOM_KEYS})


def normalize_log_records(records: object, user: dict | None = None) -> dict:
    user = user or {}
    normalized: dict[str, dict] = {}
    for index, record in enumerate(list_records(records)):
        if not isinstance(record, dict):
            continue
        log_date = safe_text(record.get("date"), "", 10)
        if not is_iso_date(log_date):
            continue
        record_id = clean_record_id(record.get("id") or f"log-import-{index}", "log")
        if record_id in normalized:
            record_id = f"{record_id}-{index}"
        normalized[record_id] = {
            "id": record_id,
            "date": log_date,
            "wellbeing": clamp_number(record.get("wellbeing"), 1, 5, 3),
            "energy": clamp_number(record.get("energy"), 1, 5, 3),
            "mood": clamp_number(record.get("mood"), 1, 5, 3),
            "libido": clamp_number(record.get("libido"), 1, 5, 3),
            "pain": clamp_number(record.get("pain"), 0, 5, 3),
            "symptoms": normalize_symptoms(record.get("symptoms")),
            "note": safe_text(record.get("note"), "", 4000),
            "authorName": safe_text(record.get("authorName"), user.get("name", "Участник"), 120),
            "authorAddr": safe_text(record.get("authorAddr"), user.get("addr", "telegram"), 160),
            "updatedAt": safe_text(record.get("updatedAt"), iso_now(), 64),
        }
    return dict(sorted(normalized.items(), key=lambda item: item[1]["date"]))


def normalize_snapshot(raw: object, user: dict | None = None) -> dict:
    if not isinstance(raw, dict):
        raise ApiError(400, "Файл не похож на backup Cycle Together.", "bad_backup")
    if raw.get("app") and (raw.get("app") != APP_ID or raw.get("type") != BACKUP_TYPE):
        raise ApiError(400, "Этот JSON не является backup Cycle Together.", "bad_backup")
    return {
        "settings": normalize_settings(raw.get("settings")),
        "periods": normalize_period_records(raw.get("periods"), user),
        "logs": normalize_log_records(raw.get("logs"), user),
    }


def snapshot_for_export(data: dict, user: dict) -> dict:
    normalized = normalize_snapshot(data, user)
    return {
        "app": APP_ID,
        "type": BACKUP_TYPE,
        "version": 1,
        "exportedAt": iso_now(),
        "exportedBy": {
            "name": user.get("name") or "Участник",
            "addr": user.get("addr") or "telegram",
        },
        "settings": normalized["settings"],
        "periods": list(normalized["periods"].values()),
        "logs": list(normalized["logs"].values()),
    }


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS calendars (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              owner_user_id TEXT NOT NULL,
              data_json TEXT NOT NULL,
              revision INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS memberships (
              calendar_id TEXT NOT NULL,
              user_id TEXT NOT NULL,
              role TEXT NOT NULL,
              display_name TEXT NOT NULL,
              joined_at TEXT NOT NULL,
              PRIMARY KEY (calendar_id, user_id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_state (
              user_id TEXT PRIMARY KEY,
              active_calendar_id TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS invites (
              code TEXT PRIMARY KEY,
              calendar_id TEXT NOT NULL,
              created_by_user_id TEXT NOT NULL,
              created_at TEXT NOT NULL,
              expires_at TEXT NOT NULL,
              last_used_at TEXT
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_invites_calendar ON invites(calendar_id)")


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def parse_init_data(init_data: str) -> dict:
    if not BOT_TOKEN:
        raise ApiError(401, "BOT_TOKEN не настроен на сервере.", "bot_token_missing")
    pairs = urllib.parse.parse_qsl(init_data, keep_blank_values=True)
    data = dict(pairs)
    received_hash = data.pop("hash", "")
    if not received_hash:
        raise ApiError(401, "Telegram initData без подписи.", "auth_missing_hash")

    data_check_string = "\n".join(f"{key}={value}" for key, value in sorted(data.items()))
    secret_key = hmac.new(b"WebAppData", BOT_TOKEN.encode("utf-8"), hashlib.sha256).digest()
    calculated = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calculated, received_hash):
        raise ApiError(401, "Telegram initData не прошла проверку подписи.", "auth_bad_hash")

    auth_date_raw = data.get("auth_date")
    if auth_date_raw:
        try:
            auth_date = datetime.fromtimestamp(int(auth_date_raw), timezone.utc)
        except ValueError as error:
            raise ApiError(401, "Некорректная дата авторизации Telegram.", "auth_bad_date") from error
        if (utc_now() - auth_date).total_seconds() > AUTH_TTL_SECONDS:
            raise ApiError(401, "Сессия Telegram устарела. Открой мини-приложение заново.", "auth_expired")

    try:
        telegram_user = json.loads(data.get("user", "{}"))
    except json.JSONDecodeError as error:
        raise ApiError(401, "Не удалось прочитать пользователя Telegram.", "auth_bad_user") from error

    user_id = telegram_user.get("id")
    if not user_id:
        raise ApiError(401, "Telegram не передал id пользователя.", "auth_no_user")
    first_name = safe_text(telegram_user.get("first_name"), "", 80)
    last_name = safe_text(telegram_user.get("last_name"), "", 80)
    username = safe_text(telegram_user.get("username"), "", 80)
    display_name = " ".join(part for part in [first_name, last_name] if part).strip() or username or f"User {user_id}"
    return {
        "id": str(user_id),
        "name": display_name,
        "username": username,
        "addr": f"telegram:{user_id}",
        "isDev": False,
        "startParam": safe_text(data.get("start_param"), "", 128),
    }


def dev_user(handler: BaseHTTPRequestHandler) -> dict:
    parsed = urllib.parse.urlparse(handler.path)
    query = urllib.parse.parse_qs(parsed.query)
    raw_id = handler.headers.get("X-Dev-User") or query.get("dev_user", ["local-user"])[0]
    user_id = re.sub(r"[^A-Za-z0-9_.:-]", "", raw_id)[:80] or "local-user"
    name = "Партнер" if "partner" in user_id.lower() else "Локальный участник"
    return {
        "id": f"dev:{user_id}",
        "name": name,
        "username": user_id,
        "addr": f"dev:{user_id}",
        "isDev": True,
        "startParam": "",
    }


def authenticate(handler: BaseHTTPRequestHandler) -> dict:
    init_data = handler.headers.get("X-Telegram-Init-Data", "")
    if init_data:
        return parse_init_data(init_data)
    if DEV_MODE or not BOT_TOKEN:
        return dev_user(handler)
    raise ApiError(401, "Открой приложение из Telegram, чтобы сервер получил initData.", "auth_required")


def request_base_url(handler: BaseHTTPRequestHandler) -> str:
    if PUBLIC_URL:
        return PUBLIC_URL
    proto = handler.headers.get("X-Forwarded-Proto", "http")
    host = handler.headers.get("X-Forwarded-Host") or handler.headers.get("Host", f"127.0.0.1:{PORT}")
    return f"{proto}://{host}".rstrip("/")


def create_calendar(conn: sqlite3.Connection, user: dict) -> str:
    calendar_id = "cal_" + secrets.token_urlsafe(12)
    now = iso_now()
    conn.execute(
        """
        INSERT INTO calendars (id, title, owner_user_id, data_json, revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
        """,
        (calendar_id, "Cycle Together", user["id"], json_dumps(default_snapshot()), now, now),
    )
    conn.execute(
        """
        INSERT INTO memberships (calendar_id, user_id, role, display_name, joined_at)
        VALUES (?, ?, 'owner', ?, ?)
        """,
        (calendar_id, user["id"], user["name"], now),
    )
    set_active_calendar(conn, user["id"], calendar_id)
    return calendar_id


def set_active_calendar(conn: sqlite3.Connection, user_id: str, calendar_id: str) -> None:
    conn.execute(
        """
        INSERT INTO user_state (user_id, active_calendar_id, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          active_calendar_id=excluded.active_calendar_id,
          updated_at=excluded.updated_at
        """,
        (user_id, calendar_id, iso_now()),
    )


def active_calendar_id(conn: sqlite3.Connection, user_id: str) -> str | None:
    row = conn.execute(
        """
        SELECT us.active_calendar_id
        FROM user_state us
        JOIN memberships m
          ON m.calendar_id = us.active_calendar_id AND m.user_id = us.user_id
        WHERE us.user_id=?
        """,
        (user_id,),
    ).fetchone()
    return row["active_calendar_id"] if row else None


def member_count(conn: sqlite3.Connection, calendar_id: str) -> int:
    row = conn.execute("SELECT COUNT(*) AS total FROM memberships WHERE calendar_id=?", (calendar_id,)).fetchone()
    return int(row["total"] if row else 0)


def join_calendar_by_code(conn: sqlite3.Connection, user: dict, code: str) -> str:
    invite = conn.execute("SELECT * FROM invites WHERE code=?", (code,)).fetchone()
    if not invite:
        raise ApiError(404, "Ссылка приглашения не найдена или уже неверная.", "invite_not_found")
    if parse_iso_datetime(invite["expires_at"]) < utc_now():
        raise ApiError(410, "Срок действия приглашения истёк.", "invite_expired")

    calendar_id = invite["calendar_id"]
    existing = conn.execute(
        "SELECT 1 FROM memberships WHERE calendar_id=? AND user_id=?",
        (calendar_id, user["id"]),
    ).fetchone()
    if not existing and member_count(conn, calendar_id) >= MAX_MEMBERS:
        raise ApiError(409, "В этом календаре уже два участника.", "calendar_full")
    if not existing:
        conn.execute(
            """
            INSERT INTO memberships (calendar_id, user_id, role, display_name, joined_at)
            VALUES (?, ?, 'partner', ?, ?)
            """,
            (calendar_id, user["id"], user["name"], iso_now()),
        )
    conn.execute("UPDATE invites SET last_used_at=? WHERE code=?", (iso_now(), code))
    set_active_calendar(conn, user["id"], calendar_id)
    return calendar_id


def get_start_param(handler: BaseHTTPRequestHandler, user: dict) -> str:
    parsed = urllib.parse.urlparse(handler.path)
    query = urllib.parse.parse_qs(parsed.query)
    return safe_text(
        query.get("start", query.get("startapp", [user.get("startParam", "")]))[0],
        "",
        128,
    )


def ensure_calendar(conn: sqlite3.Connection, user: dict, start_param: str = "") -> str:
    normalized = start_param.strip()
    if normalized.startswith("join_"):
        code = normalized[5:].upper()
        if re.match(r"^[A-Z2-7]{6,24}$", code):
            return join_calendar_by_code(conn, user, code)

    current = active_calendar_id(conn, user["id"])
    if current:
        return current
    return create_calendar(conn, user)


def load_calendar(conn: sqlite3.Connection, user: dict, calendar_id: str) -> dict:
    row = conn.execute(
        """
        SELECT c.*
        FROM calendars c
        JOIN memberships m ON m.calendar_id=c.id
        WHERE c.id=? AND m.user_id=?
        """,
        (calendar_id, user["id"]),
    ).fetchone()
    if not row:
        raise ApiError(404, "Календарь не найден.", "calendar_not_found")
    try:
        data = json.loads(row["data_json"])
    except json.JSONDecodeError:
        data = default_snapshot()
    normalized = normalize_snapshot(data, user)
    return {
        "id": row["id"],
        "title": row["title"],
        "ownerUserId": row["owner_user_id"],
        "revision": row["revision"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "data": normalized,
    }


def calendar_members(conn: sqlite3.Connection, calendar_id: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT user_id, role, display_name, joined_at
        FROM memberships
        WHERE calendar_id=?
        ORDER BY joined_at ASC
        """,
        (calendar_id,),
    ).fetchall()
    return [
        {
            "userId": row["user_id"],
            "role": row["role"],
            "displayName": row["display_name"],
            "joinedAt": row["joined_at"],
        }
        for row in rows
    ]


def response_calendar(conn: sqlite3.Connection, user: dict, calendar_id: str) -> dict:
    calendar = load_calendar(conn, user, calendar_id)
    snapshot = snapshot_for_export(calendar["data"], user)
    return {
        "id": calendar["id"],
        "title": calendar["title"],
        "revision": calendar["revision"],
        "updatedAt": calendar["updatedAt"],
        "memberLimit": MAX_MEMBERS,
        "members": calendar_members(conn, calendar_id),
        "snapshot": snapshot,
    }


def save_calendar_data(conn: sqlite3.Connection, calendar_id: str, data: dict) -> None:
    conn.execute(
        """
        UPDATE calendars
        SET data_json=?, revision=revision+1, updated_at=?
        WHERE id=?
        """,
        (json_dumps(normalize_snapshot(data)), iso_now(), calendar_id),
    )


def mutate_calendar(conn: sqlite3.Connection, user: dict, mutator) -> dict:
    calendar_id = ensure_calendar(conn, user)
    calendar = load_calendar(conn, user, calendar_id)
    data = calendar["data"]
    mutator(data)
    save_calendar_data(conn, calendar_id, data)
    return response_calendar(conn, user, calendar_id)


def make_invite_code() -> str:
    return base64.b32encode(secrets.token_bytes(6)).decode("ascii").rstrip("=")


def make_invite_link(code: str, base_url: str = "") -> str:
    if BOT_USERNAME:
        return f"https://t.me/{BOT_USERNAME}?start=join_{code}"
    if base_url:
        suffix = f"?startapp=join_{code}"
        if DEV_MODE or not BOT_TOKEN:
            suffix += "&dev_user=partner"
        return base_url.rstrip("/") + "/" + suffix
    return f"join_{code}"


def make_direct_app_link(code: str, base_url: str = "") -> str:
    if BOT_USERNAME:
        return f"https://t.me/{BOT_USERNAME}?startapp=join_{code}"
    if base_url:
        return base_url.rstrip("/") + f"/?startapp=join_{code}"
    return f"join_{code}"


def read_json_body(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0") or "0")
    if length > MAX_BODY_BYTES:
        raise ApiError(413, "Слишком большой запрос.", "body_too_large")
    raw = handler.rfile.read(length) if length else b"{}"
    try:
        body = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as error:
        raise ApiError(400, "Не удалось прочитать JSON.", "bad_json") from error
    if not isinstance(body, dict):
        raise ApiError(400, "Ожидался JSON-объект.", "bad_json")
    return body


class CycleTogetherHandler(BaseHTTPRequestHandler):
    server_version = "CycleTogetherTelegram/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print("%s - - [%s] %s" % (self.client_address[0], self.log_date_time_string(), fmt % args))

    def do_GET(self) -> None:
        try:
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path == "/health":
                self.send_json({"ok": True, "time": iso_now()})
                return
            if parsed.path.startswith("/api/"):
                self.handle_api_get(parsed)
                return
            self.serve_static(parsed.path)
        except ApiError as error:
            self.send_error_json(error)
        except Exception as error:
            print("Unhandled GET error:", repr(error))
            self.send_error_json(ApiError(500, "Внутренняя ошибка сервера.", "server_error"))

    def do_POST(self) -> None:
        try:
            parsed = urllib.parse.urlparse(self.path)
            if not parsed.path.startswith("/api/"):
                raise ApiError(404, "Маршрут не найден.", "not_found")
            self.handle_api_post(parsed)
        except ApiError as error:
            self.send_error_json(error)
        except Exception as error:
            print("Unhandled POST error:", repr(error))
            self.send_error_json(ApiError(500, "Внутренняя ошибка сервера.", "server_error"))

    def do_DELETE(self) -> None:
        try:
            parsed = urllib.parse.urlparse(self.path)
            if not parsed.path.startswith("/api/"):
                raise ApiError(404, "Маршрут не найден.", "not_found")
            self.handle_api_delete(parsed)
        except ApiError as error:
            self.send_error_json(error)
        except Exception as error:
            print("Unhandled DELETE error:", repr(error))
            self.send_error_json(ApiError(500, "Внутренняя ошибка сервера.", "server_error"))

    def handle_api_get(self, parsed: urllib.parse.ParseResult) -> None:
        user = authenticate(self)
        with get_conn() as conn:
            if parsed.path == "/api/session":
                start_param = get_start_param(self, user)
                calendar_id = ensure_calendar(conn, user, start_param)
                self.send_json(
                    {
                        "ok": True,
                        "user": user,
                        "calendar": response_calendar(conn, user, calendar_id),
                        "telegram": {
                            "botUsername": BOT_USERNAME,
                            "publicUrl": request_base_url(self),
                            "startParam": start_param,
                        },
                    }
                )
                return
            if parsed.path == "/api/calendar":
                calendar_id = ensure_calendar(conn, user)
                self.send_json({"ok": True, "calendar": response_calendar(conn, user, calendar_id)})
                return
            if parsed.path == "/api/export":
                calendar_id = ensure_calendar(conn, user)
                calendar = load_calendar(conn, user, calendar_id)
                payload = snapshot_for_export(calendar["data"], user)
                file_name = f"cycle-together-{payload['exportedAt'][:10]}.cycle-together.json"
                self.send_bytes(
                    pretty_json(payload),
                    "application/json; charset=utf-8",
                    extra_headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
                )
                return
        raise ApiError(404, "Маршрут не найден.", "not_found")

    def handle_api_post(self, parsed: urllib.parse.ParseResult) -> None:
        user = authenticate(self)
        body = read_json_body(self)
        with get_conn() as conn:
            if parsed.path == "/api/invite":
                calendar_id = ensure_calendar(conn, user)
                code = make_invite_code()
                expires_at = iso_from_datetime(utc_now() + timedelta(days=INVITE_TTL_DAYS))
                conn.execute(
                    """
                    INSERT INTO invites (code, calendar_id, created_by_user_id, created_at, expires_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (code, calendar_id, user["id"], iso_now(), expires_at),
                )
                self.send_json(
                    {
                        "ok": True,
                        "code": code,
                        "link": make_invite_link(code, request_base_url(self)),
                        "directAppLink": make_direct_app_link(code, request_base_url(self)),
                        "expiresAt": expires_at,
                    }
                )
                return
            if parsed.path == "/api/settings":
                def update_settings(data: dict) -> None:
                    data["settings"] = normalize_settings(body.get("settings", body))

                self.send_json({"ok": True, "calendar": mutate_calendar(conn, user, update_settings)})
                return
            if parsed.path == "/api/periods":
                record = body.get("record", body)

                def upsert_period(data: dict) -> None:
                    normalized = normalize_period_records([record], user)
                    if not normalized:
                        raise ApiError(400, "Проверь даты начала и конца цикла.", "bad_period")
                    item = list(normalized.values())[0]
                    item["authorName"] = user["name"]
                    item["authorAddr"] = user["addr"]
                    item["updatedAt"] = iso_now()
                    data.setdefault("periods", {})[item["id"]] = item

                self.send_json({"ok": True, "calendar": mutate_calendar(conn, user, upsert_period)})
                return
            if parsed.path == "/api/logs":
                record = body.get("record", body)

                def upsert_log(data: dict) -> None:
                    normalized = normalize_log_records([record], user)
                    if not normalized:
                        raise ApiError(400, "Проверь дату записи.", "bad_log")
                    item = list(normalized.values())[0]
                    item["authorName"] = user["name"]
                    item["authorAddr"] = user["addr"]
                    item["updatedAt"] = iso_now()
                    data.setdefault("logs", {})[item["id"]] = item

                self.send_json({"ok": True, "calendar": mutate_calendar(conn, user, upsert_log)})
                return
            if parsed.path == "/api/import":
                raw_snapshot = body.get("snapshot", body)

                def replace_data(data: dict) -> None:
                    data.clear()
                    data.update(normalize_snapshot(raw_snapshot, user))

                self.send_json({"ok": True, "calendar": mutate_calendar(conn, user, replace_data)})
                return
        raise ApiError(404, "Маршрут не найден.", "not_found")

    def handle_api_delete(self, parsed: urllib.parse.ParseResult) -> None:
        user = authenticate(self)
        path = parsed.path
        with get_conn() as conn:
            if path.startswith("/api/periods/"):
                record_id = urllib.parse.unquote(path.removeprefix("/api/periods/"))

                def delete_period(data: dict) -> None:
                    data.setdefault("periods", {}).pop(record_id, None)

                self.send_json({"ok": True, "calendar": mutate_calendar(conn, user, delete_period)})
                return
            if path.startswith("/api/logs/"):
                record_id = urllib.parse.unquote(path.removeprefix("/api/logs/"))

                def delete_log(data: dict) -> None:
                    data.setdefault("logs", {}).pop(record_id, None)

                self.send_json({"ok": True, "calendar": mutate_calendar(conn, user, delete_log)})
                return
        raise ApiError(404, "Маршрут не найден.", "not_found")

    def serve_static(self, raw_path: str) -> None:
        path = urllib.parse.unquote(raw_path.split("?", 1)[0])
        if path in {"", "/"}:
            path = "/index.html"
        safe_parts = [part for part in path.strip("/").split("/") if part and part not in {".", ".."}]
        file_path = STATIC_DIR.joinpath(*safe_parts)
        if not file_path.exists() or not file_path.is_file():
            file_path = STATIC_DIR / "index.html"
        content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        self.send_bytes(file_path.read_bytes(), content_type)

    def send_json(self, value: object, status: int = 200) -> None:
        self.send_bytes(json_dumps(value).encode("utf-8"), "application/json; charset=utf-8", status)

    def send_bytes(
        self,
        body: bytes,
        content_type: str,
        status: int = 200,
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store" if content_type.startswith("application/json") else "public, max-age=60")
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, error: ApiError) -> None:
        self.send_json({"ok": False, "error": error.message, "code": error.code}, error.status)


def bot_api(method: str, payload: dict | None = None) -> dict:
    if not BOT_TOKEN:
        return {"ok": False}
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/{method}"
    data = json_dumps(payload or {}).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=35) as response:
        return json.loads(response.read().decode("utf-8"))


def send_bot_message(chat_id: int, text: str, start_param: str = "") -> None:
    if not PUBLIC_URL:
        text += "\n\nPUBLIC_URL пока не настроен на сервере."
        reply_markup = None
    else:
        url = PUBLIC_URL
        if start_param:
            url += "/?startapp=" + urllib.parse.quote(start_param)
        reply_markup = {
            "inline_keyboard": [
                [
                    {
                        "text": "Открыть календарь",
                        "web_app": {"url": url},
                    }
                ]
            ]
        }
    payload = {
        "chat_id": chat_id,
        "text": text,
        "reply_markup": reply_markup,
    }
    bot_api("sendMessage", payload)


def handle_bot_update(update: dict) -> None:
    message = update.get("message") or update.get("edited_message") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    text = safe_text(message.get("text"), "", 4096)
    if not chat_id or not text:
        return

    if text.startswith("/start"):
        parts = text.split(maxsplit=1)
        start_param = parts[1].strip() if len(parts) > 1 else ""
        send_bot_message(
            chat_id,
            "Привет. Это Cycle Together для Telegram: общий календарь цикла для двоих.",
            start_param,
        )
        return
    if text.startswith("/help"):
        send_bot_message(
            chat_id,
            "Открой мини-приложение кнопкой ниже. Внутри можно создать ссылку приглашения для партнёра и импортировать JSON backup из Delta Chat.",
        )
        return
    send_bot_message(chat_id, "Нажми кнопку, чтобы открыть календарь.")


def configure_bot_menu() -> None:
    if not BOT_TOKEN or not PUBLIC_URL:
        return
    try:
        bot_api(
            "setChatMenuButton",
            {
                "menu_button": {
                    "type": "web_app",
                    "text": "Календарь",
                    "web_app": {"url": PUBLIC_URL},
                }
            },
        )
    except Exception as error:
        print("Could not configure Telegram menu button:", repr(error))


def bot_polling_loop() -> None:
    if not BOT_TOKEN:
        print("BOT_TOKEN is not set: bot polling is disabled.")
        return
    offset = 0
    print("Telegram bot polling started.")
    while True:
        try:
            result = bot_api("getUpdates", {"timeout": 30, "offset": offset, "allowed_updates": ["message"]})
            for update in result.get("result", []):
                offset = max(offset, int(update.get("update_id", 0)) + 1)
                handle_bot_update(update)
        except urllib.error.HTTPError as error:
            print("Telegram HTTP error:", error.read().decode("utf-8", errors="replace"))
            time.sleep(5)
        except Exception as error:
            print("Telegram polling error:", repr(error))
            time.sleep(5)


def start_bot_thread() -> None:
    if not BOT_TOKEN:
        return
    configure_bot_menu()
    thread = threading.Thread(target=bot_polling_loop, name="telegram-bot", daemon=True)
    thread.start()


def main() -> None:
    init_db()
    start_bot_thread()
    mode = "development" if (DEV_MODE or not BOT_TOKEN) else "telegram"
    print(f"Cycle Together Telegram server listening on http://127.0.0.1:{PORT}")
    print(f"Mode: {mode}. Database: {DB_PATH}")
    if not BOT_TOKEN:
        print("No BOT_TOKEN set: local browser preview is enabled.")
    server = ThreadingHTTPServer(("0.0.0.0", PORT), CycleTogetherHandler)
    server.serve_forever()


if __name__ == "__main__":
    main()
