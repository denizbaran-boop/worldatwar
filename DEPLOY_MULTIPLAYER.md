# Deploy Multiplayer Socket Server

This project runs Socket.IO in the standalone `server/` app.

## 1. Deploy the server

## Option A: Render

1. Create a new **Web Service** from this repo.
2. Set **Root Directory** to `server`.
3. Build command: `npm ci && npm run build`
4. Start command: `npm start`
5. Health check path: `/health`

You can also use the included [render.yaml](/Users/deniz/Documents/WorldAtWar/render.yaml).

## Option B: Railway

1. Create a new service from this repo.
2. Use the included [railway.json](/Users/deniz/Documents/WorldAtWar/railway.json) (or set equivalent commands):
   - Build: `cd server && npm ci && npm run build`
   - Start: `cd server && npm start`

## 2. Server environment variables

Set these on Render/Railway:

- `PORT` (platform usually injects this automatically)
- `FRONTEND_URL=https://worldatwar.online`
- `ALLOWED_ORIGINS=https://worldatwar.online,https://www.worldatwar.online`
- `ALLOWED_ORIGIN_REGEX=^https://.*\.vercel\.app$`

Notes:
- `ALLOWED_ORIGINS` is a comma-separated exact allow-list.
- `ALLOWED_ORIGIN_REGEX` supports preview URLs (for example Vercel preview deployments).
- Localhost is allowed by default for local development.

## 3. Frontend environment variable

In Vercel (and `.env.local` for local testing), set:

- `NEXT_PUBLIC_SOCKET_URL=https://<your-socket-server-domain>`

Example:

- `NEXT_PUBLIC_SOCKET_URL=https://worldatwar-socket.onrender.com`

Do not add a trailing slash.

## 4. Connect frontend to backend

1. Deploy the socket server.
2. Confirm `GET /health` returns `{ "status": "ok" }`.
3. Set `NEXT_PUBLIC_SOCKET_URL` in Vercel to your deployed socket URL.
4. Redeploy frontend.
5. Verify multiplayer lobby + in-game sync in two browser sessions.

## 5. Local development (unchanged)

- Frontend: `npm run dev`
- Socket server: `npm run dev:server`
- Or both: `npm run dev:all`

Default local socket URL remains `http://localhost:3001`.
