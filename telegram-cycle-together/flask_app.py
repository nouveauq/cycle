from __future__ import annotations

import hashlib
import os
import re
import urllib.parse

from flask import Flask, Response, jsonify, request, send_from_directory

import server


app = Flask(__name__, static_folder=str(server.STATIC_DIR), static_url_path="")


def webhook_secret() -> str:
    configured = os.environ.get("WEBHOOK_SECRET", "").strip()
    if configured:
        return configured
    if server.BOT_TOKEN:
        return hashlib.sha256(server.BOT_TOKEN.encode("utf-8")).hexdigest()[:32]
    return "dev-webhook"


def flask_dev_user() -> dict:
    raw_id = request.headers.get("X-Dev-User") or request.args.get("dev_user") or "local-user"
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


def authenticate() -> dict:
    init_data = request.headers.get("X-Telegram-Init-Data", "")
    if init_data:
        return server.parse_init_data(init_data)
    if server.DEV_MODE or not server.BOT_TOKEN:
        return flask_dev_user()
    raise server.ApiError(401, "Открой приложение из Telegram, чтобы сервер получил initData.", "auth_required")


def request_base_url() -> str:
    if server.PUBLIC_URL:
        return server.PUBLIC_URL
    return request.url_root.rstrip("/")


def get_start_param(user: dict) -> str:
    return server.safe_text(
        request.args.get("start") or request.args.get("startapp") or user.get("startParam", ""),
        "",
        128,
    )


def read_body() -> dict:
    body = request.get_json(silent=True)
    if body is None:
        return {}
    if not isinstance(body, dict):
        raise server.ApiError(400, "Ожидался JSON-объект.", "bad_json")
    return body


def json_response(value: object, status: int = 200):
    return app.response_class(server.json_dumps(value), status=status, mimetype="application/json")


@app.errorhandler(server.ApiError)
def handle_api_error(error: server.ApiError):
    return json_response({"ok": False, "error": error.message, "code": error.code}, error.status)


@app.errorhandler(Exception)
def handle_error(error: Exception):
    print("Unhandled Flask error:", repr(error))
    return json_response({"ok": False, "error": "Внутренняя ошибка сервера.", "code": "server_error"}, 500)


@app.get("/")
def index():
    return send_from_directory(server.STATIC_DIR, "index.html")


@app.get("/<path:path>")
def static_files(path: str):
    if path.startswith("api/") or path.startswith("telegram-webhook/"):
        raise server.ApiError(404, "Маршрут не найден.", "not_found")
    return send_from_directory(server.STATIC_DIR, path)


@app.get("/health")
def health():
    return json_response({"ok": True, "time": server.iso_now()})


@app.get("/api/session")
def api_session():
    user = authenticate()
    with server.get_conn() as conn:
        calendar_id = server.ensure_calendar(conn, user, get_start_param(user))
        return json_response(
            {
                "ok": True,
                "user": user,
                "calendar": server.response_calendar(conn, user, calendar_id),
                "telegram": {
                    "botUsername": server.BOT_USERNAME,
                    "publicUrl": request_base_url(),
                    "startParam": get_start_param(user),
                },
            }
        )


@app.get("/api/calendar")
def api_calendar():
    user = authenticate()
    with server.get_conn() as conn:
        calendar_id = server.ensure_calendar(conn, user)
        return json_response({"ok": True, "calendar": server.response_calendar(conn, user, calendar_id)})


@app.get("/api/export")
def api_export():
    user = authenticate()
    with server.get_conn() as conn:
        calendar_id = server.ensure_calendar(conn, user)
        calendar = server.load_calendar(conn, user, calendar_id)
        payload = server.snapshot_for_export(calendar["data"], user)
        file_name = f"cycle-together-{payload['exportedAt'][:10]}.cycle-together.json"
        return Response(
            server.pretty_json(payload),
            mimetype="application/json",
            headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
        )


@app.post("/api/invite")
def api_invite():
    user = authenticate()
    with server.get_conn() as conn:
        calendar_id = server.ensure_calendar(conn, user)
        code = server.make_invite_code()
        expires_at = server.iso_from_datetime(server.utc_now() + server.timedelta(days=server.INVITE_TTL_DAYS))
        conn.execute(
            """
            INSERT INTO invites (code, calendar_id, created_by_user_id, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (code, calendar_id, user["id"], server.iso_now(), expires_at),
        )
        return json_response(
            {
                "ok": True,
                "code": code,
                "link": server.make_invite_link(code, request_base_url()),
                "directAppLink": server.make_direct_app_link(code, request_base_url()),
                "expiresAt": expires_at,
            }
        )


@app.post("/api/settings")
def api_settings():
    user = authenticate()
    body = read_body()

    def update_settings(data: dict) -> None:
        data["settings"] = server.normalize_settings(body.get("settings", body))

    with server.get_conn() as conn:
        return json_response({"ok": True, "calendar": server.mutate_calendar(conn, user, update_settings)})


@app.post("/api/periods")
def api_periods():
    user = authenticate()
    body = read_body()
    record = body.get("record", body)

    def upsert_period(data: dict) -> None:
        normalized = server.normalize_period_records([record], user)
        if not normalized:
            raise server.ApiError(400, "Проверь даты начала и конца цикла.", "bad_period")
        item = list(normalized.values())[0]
        item["authorName"] = user["name"]
        item["authorAddr"] = user["addr"]
        item["updatedAt"] = server.iso_now()
        data.setdefault("periods", {})[item["id"]] = item

    with server.get_conn() as conn:
        return json_response({"ok": True, "calendar": server.mutate_calendar(conn, user, upsert_period)})


@app.post("/api/logs")
def api_logs():
    user = authenticate()
    body = read_body()
    record = body.get("record", body)

    def upsert_log(data: dict) -> None:
        normalized = server.normalize_log_records([record], user)
        if not normalized:
            raise server.ApiError(400, "Проверь дату записи.", "bad_log")
        item = list(normalized.values())[0]
        item["authorName"] = user["name"]
        item["authorAddr"] = user["addr"]
        item["updatedAt"] = server.iso_now()
        data.setdefault("logs", {})[item["id"]] = item

    with server.get_conn() as conn:
        return json_response({"ok": True, "calendar": server.mutate_calendar(conn, user, upsert_log)})


@app.post("/api/import")
def api_import():
    user = authenticate()
    body = read_body()
    raw_snapshot = body.get("snapshot", body)

    def replace_data(data: dict) -> None:
        data.clear()
        data.update(server.normalize_snapshot(raw_snapshot, user))

    with server.get_conn() as conn:
        return json_response({"ok": True, "calendar": server.mutate_calendar(conn, user, replace_data)})


@app.delete("/api/periods/<path:record_id>")
def api_delete_period(record_id: str):
    user = authenticate()
    record_id = urllib.parse.unquote(record_id)

    def delete_period(data: dict) -> None:
        data.setdefault("periods", {}).pop(record_id, None)

    with server.get_conn() as conn:
        return json_response({"ok": True, "calendar": server.mutate_calendar(conn, user, delete_period)})


@app.delete("/api/logs/<path:record_id>")
def api_delete_log(record_id: str):
    user = authenticate()
    record_id = urllib.parse.unquote(record_id)

    def delete_log(data: dict) -> None:
        data.setdefault("logs", {}).pop(record_id, None)

    with server.get_conn() as conn:
        return json_response({"ok": True, "calendar": server.mutate_calendar(conn, user, delete_log)})


@app.post("/telegram-webhook/<secret>")
def telegram_webhook(secret: str):
    if secret != webhook_secret():
        raise server.ApiError(403, "Неверный webhook secret.", "bad_webhook_secret")
    update = request.get_json(silent=True) or {}
    server.handle_bot_update(update)
    return jsonify({"ok": True})


server.init_db()
