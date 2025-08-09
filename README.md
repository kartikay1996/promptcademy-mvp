# PromptCademy — MVP (Node + SQLite)

A dead-simple starter that replicates the Bubble guide without Bubble.

## Features
- Email/password auth (sessions)
- Lessons list + detail
- Playground with OpenAI call
- Save to Library (user's prompts)
- Weekly Challenge submit
- Settings with Stripe Checkout (subscription)

## Quick start
1) Install Node 18+
2) `cp .env.example .env` and fill `SESSION_SECRET`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`.
3) `npm install`
4) `npm run seed`  (creates `data.sqlite` and seeds sample Lessons/Challenge/Product)
5) `npm start` then open http://localhost:3000

## Deploy
- **Docker**: build with `docker build -t promptcademy .` then run `docker run -p 3000:3000 --env-file .env promptcademy`
- **Render/Fly/Heroku**: add `npm run seed` as a one-off before first boot (or set `SEED_ON_BOOT=true` env and it seeds on start).

## Notes
- Data is SQLite on disk (`/data/data.sqlite`). For a real app, use Postgres.
- Minimal EJS views to keep things readable.
