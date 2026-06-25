from __future__ import annotations

import sys

import flask_app
import server


def main() -> None:
    if not server.BOT_TOKEN:
        print("BOT_TOKEN не найден. Проверь файл .env.")
        sys.exit(1)
    if not server.PUBLIC_URL:
        print("PUBLIC_URL не найден. Для PythonAnywhere укажи https://USERNAME.pythonanywhere.com")
        sys.exit(1)

    webhook_url = server.PUBLIC_URL.rstrip("/") + "/telegram-webhook/" + flask_app.webhook_secret()
    webhook_result = server.bot_api(
        "setWebhook",
        {
            "url": webhook_url,
            "allowed_updates": ["message"],
        },
    )
    menu_result = server.bot_api(
        "setChatMenuButton",
        {
            "menu_button": {
                "type": "web_app",
                "text": "Календарь",
                "web_app": {"url": server.PUBLIC_URL.rstrip("/")},
            }
        },
    )
    info = server.bot_api("getWebhookInfo", {})
    print("Webhook URL:", webhook_url)
    print("setWebhook:", server.json_dumps(webhook_result))
    print("setChatMenuButton:", server.json_dumps(menu_result))
    print("getWebhookInfo:", server.json_dumps(info))


if __name__ == "__main__":
    main()
