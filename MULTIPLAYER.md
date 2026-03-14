# WorldAtWar — Multiplayer Architecture

## Overview

WorldAtWar uses a two-tier architecture:

| Layer | Technology | Deployment |
|-------|-----------|------------|
| Frontend | Next.js (React, TypeScript) | Vercel |
| Realtime server | Node.js + Express + Socket.IO | Render / Railway / Fly.io |

Because Vercel's serverless runtime does not support persistent WebSocket connections, the Socket.IO server lives in the **`server/`** directory and must be deployed separately.

---

## Directory Structure

```
worldatwar/
├── src/
│   └── lib/
│       └── multiplayer/          # Client-side socket layer
│           ├── types.ts          # Shared room/player types (mirror of server/src/types.ts)
│           ├── socket.ts         # Socket.IO client singleton
│           └── useRoom.ts        # React hook — all room state + actions
│
├── server/                       # Standalone Socket.IO server
│   ├── src/
│   │   ├── types.ts              # Room/player models + event payload types
│   │   ├── rooms/
│   │   │   ├── roomStore.ts      # IRoomStore interface + MemoryRoomStore
│   │   │   └── roomManager.ts    # Room business logic (create/join/leave/kick/start)
│   │   └── index.ts             # Express + Socket.IO server entry point
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── MULTIPLAYER.md                # This file
└── .env.local.example            # Frontend environment variables
```

---

## Room Lifecycle

```
                  ┌─────────────────────────────────────────────────┐
                  │                  Room statuses                  │
                  │                                                 │
   createRoom ──► │  "lobby"  ──► "setup"  ──► "in_game"  ──► "finished" │
                  │                                                 │
                  └─────────────────────────────────────────────────┘
```

1. **lobby** — players can join/leave/be kicked; host can start
2. **setup** — host clicked Start Game; all clients navigate to the game config screen
3. **in_game** — *(future)* shared game state synchronized each turn
4. **finished** — *(future)* rankings broadcast to all clients

---

## Socket Events Reference

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `room:create` | `{ playerName, playerId }` | Create a new lobby |
| `room:join` | `{ code, playerName, playerId }` | Join an existing lobby |
| `room:reconnect` | `{ code, playerId }` | Re-attach to a room after refresh/disconnect |
| `room:leave` | `{ code, playerId }` | Leave the room voluntarily |
| `room:kick` | `{ code, hostId, targetId }` | Host removes another player |
| `room:start` | `{ code, hostId }` | Host starts the game for all players |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `room:created` | `GameRoom` | Sent to creator on successful room creation |
| `room:joined` | `GameRoom` | Sent to the joining player (or reconnecting player) |
| `room:updated` | `GameRoom` | Broadcast to all room members on any state change |
| `room:kicked` | `{ room: GameRoom, kickedId: string }` | Broadcast; kicked player detects their own id |
| `room:started` | `GameRoom` | Broadcast when host starts; triggers navigation on all clients |
| `room:left` | *(empty)* | Confirmed to the leaving player |
| `room:error` | `{ event: string, error: RoomErrorCode }` | Error response for any failed operation |
| `room:reconnect_failed` | `{ error: string }` | Sent when reconnect target room no longer exists |

---

## Storage Layer

The server currently uses **MemoryRoomStore** — a plain `Map<string, GameRoom>` inside the Node.js process.

To swap in **Redis / Upstash** later:

1. Implement `IRoomStore` (defined in `server/src/rooms/roomStore.ts`)
2. Replace `export const roomStore = new MemoryRoomStore()` with your Redis-backed class
3. Set TTL on rooms to auto-expire abandoned lobbies

```typescript
// Example Redis store skeleton
class RedisRoomStore implements IRoomStore {
  async get(code: string)               { return JSON.parse(await redis.get(`room:${code}`) ?? "null"); }
  async set(code: string, room: GameRoom) { await redis.setex(`room:${code}`, 3600, JSON.stringify(room)); }
  async delete(code: string)            { await redis.del(`room:${code}`); }
}
```

---

## Player Identity & Reconnection

Player IDs are generated client-side on first visit and persisted in `localStorage` under the key `worldatwar_player`:

```json
{
  "playerId": "player_abc123xyz",
  "playerName": "Commander",
  "activeRoomCode": "H4NJ7Q"
}
```

On page reload / reconnect the socket emits `room:reconnect` with the stored `playerId` and `activeRoomCode`. The server marks the player `connectionStatus: "connected"` and re-emits the current room state.

---

## Running Locally

### Prerequisites

- Node.js 18+
- Two terminal windows (or use `npm run dev:all`)

### Option A — Single command

```bash
# From the project root
cp .env.local.example .env.local   # set NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
npm run dev:all
```

### Option B — Two terminals

```bash
# Terminal 1 — Next.js frontend
npm run dev

# Terminal 2 — Socket.IO server
npm run dev:server
```

### Environment Variables

**Frontend (`.env.local`):**
```
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

**Server (`server/.env`):**
```
PORT=3001
FRONTEND_URL=http://localhost:3000
```

---

## Production Deployment

### Frontend (Vercel)
1. Push to GitHub — Vercel auto-deploys
2. Set environment variable in Vercel dashboard:
   ```
   NEXT_PUBLIC_SOCKET_URL=https://your-socket-server.com
   ```

### Realtime Server (Render / Railway / Fly.io)
```bash
cd server
# Set PORT and FRONTEND_URL in the platform's environment settings
npm run build
npm start
```

The server exposes `GET /health` for uptime monitoring.

---

## What Still Remains for Full Turn Synchronization

The current implementation delivers:
- ✅ Real multi-client room creation and joining
- ✅ Shared lobby state (players, host badge, kicked, disconnect detection)
- ✅ Synchronized "start game" — all clients navigate at the same moment
- ✅ Reconnect-friendly player identity
- ✅ In-memory storage with a clean swap-out interface

What's scaffolded but not yet implemented:
- 🔲 `"in_game"` status — shared turn-by-turn game state
- 🔲 `gameConfig` field on `GameRoom` — initial map seed, player color assignments, etc.
- 🔲 Turn events: `game:action`, `game:end_turn`, `game:state_update`
- 🔲 Fog-of-war per-player filtering before broadcasting
- 🔲 Diplomacy and reinforcement events over socket
- 🔲 Persistent storage (Redis) for production-scale rooms

The `GameRoom.gameConfig` field and `room:started` event are already the right hooks for bootstrapping synchronized gameplay. When implementing turn sync, emit a `game:state_update` event from the server with a filtered view of the game state for each connected player.
