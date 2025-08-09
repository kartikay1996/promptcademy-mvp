# PromptCademy MVP Add‑On (Daily Lessons + Progress)

This bundle adds:
- Daily lesson rotation (`/api/lesson/today`)
- Per‑user progress tracking (`/api/progress`, `/api/progress/summary`)
- Optional force‑rotate for testing (`/api/rotate`)
- A tiny UI page to verify (`/public/app.html`)
- A migration SQL and a seed script

## How to install (existing Express + SQLite project)
1) **Stop your server.** Backup `app.db` (optional).
2) Apply migration:
   ```bash
   sqlite3 app.db < migrations.sql
   ```
3) Seed a few lessons (optional):
   ```bash
   node scripts/seed-lessons.js
   ```
4) Copy files:
   - `server/daily.js` -> your server folder
   - `server/routes.mvp.js` -> your server folder
   - `public/app.html` -> your public folder
   - `migrations.sql` and `scripts/seed-lessons.js` -> anywhere (scripts/ recommended)
5) Mount the routes in your server entry (after `app.use(express.json())`):
   ```js
   const mvpRoutes = require('./server/routes.mvp.js');
   app.use('/api', mvpRoutes(db));
   ```
6) Start the server and open: `http://localhost:3000/app.html`

## Notes
- Rotation uses America/Toronto local day. Change `todayStrToronto()` if needed.
- Auth stub: uses `userId = 1`. Replace with your real user session later.
- If `current_lesson_id` points to a non‑existing lesson after a reset, calling `/api/lesson/today` will auto‑rebind to the first active lesson.
