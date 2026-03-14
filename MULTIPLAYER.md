# WorldAtWar Multiplayer (Server Authoritative)

## Architecture

WorldAtWar now runs multiplayer matches as server-authoritative simulations:

- Lobby and setup state is stored on the Socket.IO server.
- Match state is generated once on the server when host starts the match.
- Clients send action intents (`match:action`) only.
- Server validates and applies actions, advances turns, runs AI turns, and broadcasts updated snapshots.
- Client UI renders from server snapshots and keeps only lightweight local UI state (selection, hover, modal visibility, animation state).

### Separation of concerns

- Pure game rules: `server/src/game/*`
- Match lifecycle and storage: `server/src/match/*`
- Action application: `server/src/actions/matchActions.ts`
- Validation helpers: `server/src/validation/matchValidation.ts`
- Lobby/room lifecycle: `server/src/rooms/*`
- Client transport/state hooks: `src/lib/multiplayer/*`
- Client rendering store/UI: `src/store/gameStore.ts`, `src/components/game/*`

## Match lifecycle

1. `room:create` / `room:join` -> room in `lobby`
2. Host sends `room:start` -> room in `setup`
3. Host setup changes via `room:config_update` (broadcast to all)
4. Host sends `match:create`
5. Server builds canonical `MatchState`, room moves to `in_game`
6. Clients receive `match:created` / `match:state`
7. Players send `match:action` intents
8. Server validates + applies + emits `match:updated`
9. On end-turn server emits `match:turnEnded`
10. On victory server emits `match:finished`, room moves to `finished`

## Socket events

### Room events

Client -> Server

- `room:create`
- `room:join`
- `room:reconnect`
- `room:leave`
- `room:kick`
- `room:start`
- `room:config_update`

Server -> Client

- `room:created`
- `room:joined`
- `room:updated`
- `room:kicked`
- `room:started`
- `room:left`
- `room:error`

### Match events

Client -> Server

- `match:create`
- `match:action`
- `match:reconnect`

Server -> Client

- `match:created`
- `match:state`
- `match:updated`
- `match:turnEnded`
- `match:finished`
- `match:error`

## Validation model

Server validates at action time:

- sender belongs to room/match
- sender controls acting faction
- match is active (`in_game`)
- action is on active player turn
- move/attack range and target legality
- peace/diplomacy constraints
- production tile ownership + occupancy
- resource availability

Invalid actions are rejected with `match:error` and no state mutation.

## Fog of war and visibility

Server stores both:

- `exploredTiles` (persistent discovery)
- `visibleTiles` (current unit-based vision)

Per-player snapshots are filtered server-side:

- undiscovered tiles are sanitized
- enemy units outside current vision are hidden
- explored terrain remains explored

## Turn sync and AI

- Only active player may issue gameplay actions.
- `end_turn` is server-owned and advances initiative.
- AI factions are part of the same canonical match and execute on server after updates.
- AI outcomes are included in normal `match:updated` broadcasts.

## Reconnect behavior

- Existing room reconnect flow stays intact (`room:reconnect`).
- If room is `in_game`, reconnecting client gets fresh `match:state`.
- Client mirrors the received snapshot into render state and continues without local resimulation.

## Storage and persistence abstraction

- Room storage abstraction: `IRoomStore` (`server/src/rooms/roomStore.ts`)
- Match storage abstraction: `IMatchStore` (`server/src/match/matchStore.ts`)

Both currently use in-memory implementations and can be replaced with Redis/Postgres-backed stores later.

## Future persistence plan

1. Introduce Redis-backed `IRoomStore` + `IMatchStore`.
2. Add snapshot versioning + optimistic conflict checks.
3. Periodically checkpoint match snapshots and append action logs.
4. Add resumable match history and post-match analytics.
