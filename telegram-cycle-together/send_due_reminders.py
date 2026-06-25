from __future__ import annotations

import server


if __name__ == "__main__":
    server.init_db()
    server.send_due_reminders()
