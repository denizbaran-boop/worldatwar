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
} from "./rooms/roomManager";
import type {
  CreateRoomPayload,
  JoinRoomPayload,
  ReconnectPayload,
  LeaveRoomPayload,
  KickPayload,
  StartRoomPayload,
  GameRoom,
} from "./types";

// ── Server setup ──────────────────────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";
const PORT = parseInt(process.env.PORT ?? "3001", 10);

const CORS_ORIGINS = [
  FRONTEND_URL,
  "http://localhost:3000",
  "http://localhost:3001",
];

const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGINS, methods: ["GET", "POST"] },
  pingTimeout: 20000,
  pingInterval: 10000,
});

app.use(cors({ origin: CORS_ORIGINS }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ── Per-socket tracking ───────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function broadcastUpdate(code: string, room: GameRoom) {
  io.to(code).emit("room:updated", room);
}

// ── Socket.IO connection handler ──────────────────────────────────────────────

io.on("connection", (socket) => {
  // ── room:create ────────────────────────────────────────────────────────────
  socket.on("room:create", ({ playerName, playerId }: CreateRoomPayload) => {
    const room = createRoom(playerId, playerName);
    const m = meta(socket);
    m.roomCode = room.code;
    m.playerId = playerId;

    socket.join(room.code);
    socket.emit("room:created", room);
  });

  // ── room:join ─────────────────────────────────────────────────────────────
  socket.on("room:join", ({ code, playerName, playerId }: JoinRoomPayload) => {
    const normalized = code.toUpperCase().trim();
    const result = joinRoom(normalized, playerId, playerName, socket.id);

    if (result.error ?? !result.room) {
      socket.emit("room:error", { event: "room:join", error: result.error ?? "unknown_error" });
      return;
    }

    const m = meta(socket);
    m.roomCode = normalized;
    m.playerId = playerId;

    socket.join(normalized);
    socket.emit("room:joined", result.room);
    // Notify other room members that someone joined
    socket.to(normalized).emit("room:updated", result.room);
  });

  // ── room:reconnect ────────────────────────────────────────────────────────
  socket.on("room:reconnect", ({ code, playerId }: ReconnectPayload) => {
    const normalized = code.toUpperCase().trim();
    const result = reconnectToRoom(normalized, playerId, socket.id);

    if (result.error ?? !result.room) {
      // Silently ignore failed reconnects — room may have expired
      socket.emit("room:reconnect_failed", { error: result.error ?? "unknown_error" });
      return;
    }

    const m = meta(socket);
    m.roomCode = normalized;
    m.playerId = playerId;

    socket.join(normalized);
    socket.emit("room:joined", result.room);
    socket.to(normalized).emit("room:updated", result.room);
  });

  // ── room:leave ────────────────────────────────────────────────────────────
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
    }
  });

  // ── room:kick ─────────────────────────────────────────────────────────────
  socket.on("room:kick", ({ code, hostId, targetId }: KickPayload) => {
    const normalized = code.toUpperCase().trim();
    const result = kickPlayer(normalized, hostId, targetId);

    if (result.error ?? !result.room) {
      socket.emit("room:error", { event: "room:kick", error: result.error ?? "unknown_error" });
      return;
    }

    // Tell everyone (including kicked player) the updated state + who was kicked
    io.to(normalized).emit("room:kicked", { room: result.room, kickedId: targetId });
  });

  // ── room:start ────────────────────────────────────────────────────────────
  socket.on("room:start", ({ code, hostId }: StartRoomPayload) => {
    const normalized = code.toUpperCase().trim();
    const result = startRoom(normalized, hostId);

    if (result.error ?? !result.room) {
      socket.emit("room:error", { event: "room:start", error: result.error ?? "unknown_error" });
      return;
    }

    // Broadcast game start to every client in the room simultaneously
    io.to(normalized).emit("room:started", result.room);
  });

  // ── disconnect ────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const m = socketMeta.get(socket.id);
    socketMeta.delete(socket.id);

    if (m?.roomCode && m?.playerId) {
      const updatedRoom = markDisconnected(m.roomCode, m.playerId);
      if (updatedRoom) {
        broadcastUpdate(m.roomCode, updatedRoom);
      }
    }
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`[WorldAtWar] Realtime server running on :${PORT}`);
  console.log(`[WorldAtWar] Accepting connections from: ${CORS_ORIGINS.join(", ")}`);
});
