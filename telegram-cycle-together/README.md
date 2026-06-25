# Cycle Together для Telegram

Telegram-версия трекера цикла для двоих. Внутри:

- `server.py` - backend, Telegram-бот, API и SQLite-хранилище;
- `static/` - Telegram Mini App;
- экспорт и импорт JSON в том же формате, что у Delta Chat/webxdc-версии.

## Как это работает для двоих

1. Первый человек открывает бота и нажимает кнопку `Открыть календарь`.
2. Сервер создаёт календарь, привязанный к Telegram id этого человека.
3. В блоке `Общий доступ` нажимается `Создать ссылку`.
4. Второй человек открывает эту ссылку, запускает мини-приложение и попадает в тот же календарь.
5. Оба видят одни и те же циклы, записи, настройки и импортированные backup-файлы.

По умолчанию календарь рассчитан на двух участников (`MAX_MEMBERS=2`).

## Совместимость backup JSON

Формат сохранён:

```json
{
  "app": "cycle-together",
  "type": "cycle-together-backup",
  "version": 1,
  "exportedAt": "2026-06-25T00:00:00.000Z",
  "exportedBy": { "name": "...", "addr": "..." },
  "settings": {
    "cycleLength": 28,
    "periodLength": 5,
    "lutealLength": 14
  },
  "periods": [],
  "logs": []
}
```

Чтобы перенести данные из Delta Chat:

1. В старом приложении нажми `Экспортировать файл`.
2. Открой Telegram-бота и мини-приложение.
3. В блоке `Экспорт и импорт` нажми `Импортировать JSON`.
4. Выбери файл `.cycle-together.json`.

Импорт заменяет текущие данные общего календаря для обоих участников.

## Локальный запуск

```powershell
cd telegram-cycle-together
Copy-Item .env.example .env
$env:DEV_MODE="1"
$env:PORT="8000"
python server.py
```

Открой:

```text
http://127.0.0.1:8000/
```

Чтобы проверить вход второго участника, сначала создай приглашение в первом окне. Затем открой ссылку из поля приглашения или подставь код вручную:

```text
http://127.0.0.1:8000/?dev_user=partner&startapp=join_КОД
```

В dev-режиме Telegram не нужен. Данные лежат в `data/cycle_together.sqlite3`.

Для реального Telegram-бота можно вписать значения в `.env`:

```text
BOT_TOKEN=123456:токен-от-BotFather
BOT_USERNAME=username_бота_без_@
PUBLIC_URL=https://адрес-твоего-приложения
```

Код в `server.py` при этом менять не нужно.

## Создание Telegram-бота

1. Открой `@BotFather`.
2. Выполни `/newbot`.
3. Сохрани токен в `BOT_TOKEN`.
4. Запомни username бота без `@` и укажи его в `BOT_USERNAME`.
5. После хостинга укажи публичный HTTPS-адрес в `PUBLIC_URL`.

При старте сервер сам вызывает `setChatMenuButton`, чтобы у бота появилась кнопка меню с мини-приложением. Команда `/start` также отправляет кнопку `Открыть календарь`.

Официальные документы Telegram:

- https://core.telegram.org/bots/webapps
- https://core.telegram.org/bots/api#setchatmenubutton

## Хостинг без включённого компьютера

Нужен сервис, который умеет постоянно запускать Python-приложение и даёт HTTPS. Важно: подключи постоянный диск, иначе SQLite-база может потеряться при перезапуске.

Хорошие варианты:

- Render, Railway, Fly.io или Koyeb: проще для старта, обычно можно деплоить из git.
- Небольшой VPS: больше ручной настройки, зато предсказуемо и данные под твоим контролем.

Минимальные переменные окружения на хостинге:

```text
BOT_TOKEN=токен-от-BotFather
BOT_USERNAME=username_бота_без_@
DATA_DIR=/data
PORT=8000
```

На Render `PUBLIC_URL` можно не задавать: приложение само возьмёт `RENDER_EXTERNAL_URL`.

Для Render/Railway/Fly лучше примонтировать persistent volume в `/data` и оставить `DATA_DIR=/data`.

GitHub Pages или обычный статический хостинг не подходят: этому приложению нужен backend для Telegram-подписи, общей базы и бота.

## PythonAnywhere

Для PythonAnywhere используется `flask_app.py`: это WSGI-версия того же приложения. Бот работает через Telegram webhook, поэтому отдельный always-on task не нужен.

В файле `.env` на PythonAnywhere укажи:

```text
BOT_TOKEN=токен-от-BotFather
BOT_USERNAME=username_бота_без_@
PUBLIC_URL=https://USERNAME.pythonanywhere.com
DATA_DIR=/home/USERNAME/cycle-together-data
PORT=8000
```

После настройки web app запусти в Bash-консоли:

```bash
cd ~/cycle-together/telegram-cycle-together
python setup_pythonanywhere_webhook.py
```

Этот скрипт подключит webhook и кнопку меню бота.

### Как обновлять код на PythonAnywhere

После изменений в GitHub зайди в Bash-консоль PythonAnywhere:

```bash
cd ~/cycle-together
git pull
workon cycle-together-env
cd telegram-cycle-together
pip install -r requirements.txt
python setup_pythonanywhere_webhook.py
```

Потом открой вкладку `Web` и нажми `Reload`. Файл `.env` и база в `DATA_DIR` при `git pull` не стираются.

### Ежедневные напоминания на PythonAnywhere

На платном PythonAnywhere можно использовать вкладку `Tasks`: создай Scheduled Task один раз в день, например утром. Команда:

```bash
/home/USERNAME/.virtualenvs/cycle-together-env/bin/python /home/USERNAME/cycle-together/telegram-cycle-together/send_due_reminders.py
```

Замени `USERNAME` и путь к репозиторию на свои. Скрипт отправляет всем участникам календаря напоминания за 3 дня до ожидаемой менструации, в день ожидаемого начала и в день ожидаемой овуляции. Уже отправленные напоминания записываются в базу и не дублируются.

На бесплатном PythonAnywhere вкладка `Tasks` недоступна. Тогда используй бесплатный внешний cron, например https://cron-job.org/:

1. В `.env` добавь секрет, придумай любую длинную строку:

```text
REMINDER_SECRET=придумай-длинный-секрет-без-пробелов
```

2. На вкладке `Web` нажми `Reload`.
3. В cron-job.org создай cronjob раз в день с URL:

```text
https://USERNAME.pythonanywhere.com/run-reminders/придумай-длинный-секрет-без-пробелов
```

Метод: `GET`. Этого достаточно, чтобы один раз в день PythonAnywhere получил запрос и отправил due-напоминания.

## Деплой через Docker

```powershell
docker build -t cycle-together-telegram .
docker run --env-file .env -p 8000:8000 -v cycle-data:/data cycle-together-telegram
```

В `.env` можно взять пример из `.env.example`.

## Приватность

- Сервер хранит календарь в SQLite.
- API принимает изменения только с валидным Telegram Mini App `initData`, если задан `BOT_TOKEN`.
- Backup-файл остаётся переносимым JSON, его можно хранить отдельно.
