import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import {
  createRoom,
  joinRoom,
  reconnectToRoom,
  leaveRoom,
  kickPlayer,
  startRoom,
  markDisconnected,
  getRoom,
  updateRoomConfig,
  setRoomStatus
} from "./rooms/roomManager";
import {
  applyMatchAction,
  createMatchForRoom,
  getMatch,
  getPerspectiveState,
  removeMatch
} from "./match/matchManager";
import type {
  CreateRoomPayload,
  JoinRoomPayload,
  ReconnectPayload,
  LeaveRoomPayload,
  KickPayload,
  StartRoomPayload,
  GameRoom,
  UpdateRoomConfigPayload
} from "./types";
import type { MatchActionPayload, MatchCreatePayload, MatchReconnectPayload } from "./match/matchTypes";

// Server setup

const app = express();
const httpServer = createServer(app);

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://worldatwar.online",
  "https://www.worldatwar.online",
  FRONTEND_URL
];

const ALLOWED_ORIGINS = Array.from(
  new Set(
    (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .concat(DEFAULT_ALLOWED_ORIGINS)
  )
);

const DEFAULT_ALLOWED_ORIGIN_PATTERNS = ["^https://.*\\.vercel\\.app$"];

const ALLOWED_ORIGIN_REGEX = (
  (process.env.ALLOWED_ORIGIN_REGEX ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .concat(DEFAULT_ALLOWED_ORIGIN_PATTERNS)
)
  .map((pattern) => {
    try {
      return new RegExp(pattern);
    } catch {
      console.warn(`[WorldAtWar] Invalid ALLOWED_ORIGIN_REGEX entry ignored: ${pattern}`);
      return null;
    }
  })
  .filter((entry): entry is RegExp => entry !== null);

const isOriginAllowed = (origin?: string) => {
  if (!origin) return true; // non-browser / same-origin server checks
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return ALLOWED_ORIGIN_REGEX.some((re) => re.test(origin));
};

const corsOrigin: cors.CorsOptions["origin"] = (origin, callback) => {
  if (isOriginAllowed(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error(`CORS origin rejected: ${origin ?? "unknown"}`));
};

const io = new Server(httpServer, {
  cors: { origin: corsOrigin, methods: ["GET", "POST"], credentials: true },
  pingTimeout: 20000,
  pingInterval: 10000
});

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

interface SocketMeta {
  roomCode: string | null;
  playerId: string | null;
}

const socketMeta = new Map<string, SocketMeta>();

function meta(socket: Socket): SocketMeta {
  let m = socketMeta.get(socket.id);
  if (!m) {
    m = { roomCode: null, playerId: null };
    socketMeta.set(socket.id, m);
  }
  return m;
}

function broadcastRoomUpdate(code: string, room: GameRoom) {
  io.to(code).emit("room:updated", room);
}

function emitMatchState(code: string, eventName: "match:created" | "match:state" | "match:updated") {
  const room = getRoom(code);
  const match = getMatch(code);
  if (!room || !match) return;

  for (const player of room.players) {
    if (!player.socketId) continue;
    const perspective = getPerspectiveState(match, player.id);
    io.to(player.socketId).emit(eventName, { matchState: perspective });
  }
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ playerName, playerId }: CreateRoomPayload) => {
    const room = createRoom(playerId, playerName);
    const m = meta(socket);
    m.roomCode = room.code;
    m.playerId = playerId;

    socket.join(room.code);
    socket.emit("room:created", room);
  });

  socket.on("room:join", ({ code, playerName, playerId }: JoinRoomPayload) => {
    const normalized = code.toUpperCase().trim();
    const result = joinRoom(normalized, playerId, playerName, socket.id);

    if (result.error || !result.room) {
      socket.emit("room:error", { event: "room:join", error: result.error ?? "unknown_error" });
      return;
    }

    const m = meta(socket);
    m.roomCode = normalized;
    m.playerId = playerId;

    socket.join(normalized);
    socket.emit("room:joined", result.room);
    socket.to(normalized).emit("room:updated", result.room);
  });

  socket.on("room:reconnect", ({ code, playerId }: ReconnectPayload) => {
    const normalized = code.toUpperCase().trim();
    const result = reconnectToRoom(normalized, playerId, socket.id);

    if (result.error || !result.room) {
      socket.emit("room:reconnect_failed", { error: result.error ?? "unknown_error" });
      return;
    }

    const m = meta(socket);
    m.roomCode = normalized;
    m.playerId = playerId;

    socket.join(normalized);
    socket.emit("room:joined", result.room);
    socket.to(normalized).emit("room:updated", result.room);

    if (result.room.status === "in_game") {
      const match = getMatch(normalized);
      if (match) {
        socket.emit("match:state", { matchState: getPerspectiveState(match, playerId) });
      }
    }
  });

  socket.on("room:leave", ({ code, playerId }: LeaveRoomPayload) => {
    const normalized = code.toUpperCase().trim();
    const updatedRoom = leaveRoom(normalized, playerId);

    const m = meta(socket);
    m.roomCode = null;
    m.playerId = null;

    socket.leave(normalized);
    socket.emit("room:left");

    if (updatedRoom) {
      io.to(normalized).emit("room:updated", updatedRoom);
      return;
    }

    removeMatch(normalized);
  });

  socket.on("room:kick", ({ code, hostId, targetId }: KickPayload) => {
    const normalized = code.toUpperCase().trim();
    const result = kickPlayer(normalized, hostId, targetId);

    if (result.error || !result.room) {
      socket.emit("room:error", { event: "room:kick", error: result.error ?? "unknown_error" });
      return;
    }

    io.to(normalized).emit("room:kicked", { room: result.room, kickedId: targetId });
  });

  socket.on("room:start", ({ code, hostId }: StartRoomPayload) => {
    const normalized = code.toUpperCase().trim();
    const result = startRoom(normalized, hostId);

    if (result.error || !result.room) {
      socket.emit("room:error", { event: "room:start", error: result.error ?? "unknown_error" });
      return;
    }

    io.to(normalized).emit("room:started", result.room);
  });

  socket.on("room:config_update", ({ code, hostId, config }: UpdateRoomConfigPayload) => {
    const normalized = code.toUpperCase().trim();
    const result = updateRoomConfig(normalized, hostId, config);
    if (result.error || !result.room) {
      socket.emit("room:error", { event: "room:config_update", error: result.error ?? "unknown_error" });
      return;
    }
    io.to(normalized).emit("room:updated", result.room);
  });

  socket.on("match:create", ({ roomCode, hostId }: MatchCreatePayload) => {
    const normalized = roomCode.toUpperCase().trim();
    const room = getRoom(normalized);
    if (!room) {
      socket.emit("match:error", { event: "match:create", error: "room_not_found" });
      return;
    }

    const created = createMatchForRoom(room, hostId);
    if (created.error || !created.match) {
      socket.emit("match:error", { event: "match:create", error: created.error ?? "match_create_failed" });
      return;
    }

    const roomUpdate = setRoomStatus(normalized, "in_game");
    if (roomUpdate.room) {
      io.to(normalized).emit("room:updated", roomUpdate.room);
    }

    emitMatchState(normalized, "match:created");
  });

  socket.on("match:action", ({ roomCode, lobbyPlayerId, action }: MatchActionPayload) => {
    const normalized = roomCode.toUpperCase().trim();
    const result = applyMatchAction(normalized, lobbyPlayerId, action);

    if (result.error || !result.match) {
      socket.emit("match:error", { event: "match:action", error: result.error ?? "action_failed" });
      return;
    }

    emitMatchState(normalized, "match:updated");

    if (action.type === "end_turn") {
      io.to(normalized).emit("match:turnEnded", { turnNumber: result.match.turnNumber, currentPlayerId: result.match.currentPlayerId });
    }

    if (result.match.phase === "finished") {
      io.to(normalized).emit("match:finished", { winner: result.match.winner, ranking: result.match.ranking });
      const roomUpdate = setRoomStatus(normalized, "finished");
      if (roomUpdate.room) io.to(normalized).emit("room:updated", roomUpdate.room);
    }
  });

  socket.on("match:reconnect", ({ roomCode, lobbyPlayerId }: MatchReconnectPayload) => {
    const normalized = roomCode.toUpperCase().trim();
    const match = getMatch(normalized);
    if (!match) {
      socket.emit("match:error", { event: "match:reconnect", error: "match_not_found" });
      return;
    }

    socket.emit("match:state", { matchState: getPerspectiveState(match, lobbyPlayerId) });
  });

  socket.on("disconnect", () => {
    const m = socketMeta.get(socket.id);
    socketMeta.delete(socket.id);

    if (m?.roomCode && m?.playerId) {
      const updatedRoom = markDisconnected(m.roomCode, m.playerId);
      if (updatedRoom) {
        broadcastRoomUpdate(m.roomCode, updatedRoom);
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`[WorldAtWar] Realtime server running on :${PORT}`);
  console.log(`[WorldAtWar] Accepting explicit origins: ${ALLOWED_ORIGINS.join(", ")}`);
  if (ALLOWED_ORIGIN_REGEX.length > 0) {
    console.log(
      `[WorldAtWar] Accepting regex origins: ${ALLOWED_ORIGIN_REGEX.map((entry) => entry.source).join(", ")}`
    );
  }
});
