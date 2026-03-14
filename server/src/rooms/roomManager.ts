import { roomStore } from "./roomStore";
import type { GameRoom, LobbyPlayer, RoomErrorCode } from "../types";

type RoomResult = { room?: GameRoom; error?: RoomErrorCode };

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function snapshot(room: GameRoom): GameRoom {
  return { ...room, players: room.players.map((p) => ({ ...p })) };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function createRoom(
  hostId: string,
  hostName: string,
  maxPlayers = 6
): GameRoom {
  let code: string;
  do {
    code = generateCode();
  } while (roomStore.get(code));

  const room: GameRoom = {
    code,
    hostId,
    status: "lobby",
    players: [
      {
        id: hostId,
        name: hostName,
        isHost: true,
        joinedAt: Date.now(),
        connectionStatus: "connected",
      },
    ],
    maxPlayers,
    createdAt: Date.now(),
  };

  roomStore.set(code, room);
  return snapshot(room);
}

export function joinRoom(
  code: string,
  playerId: string,
  playerName: string,
  socketId?: string
): RoomResult {
  const room = roomStore.get(code);
  if (!room) return { error: "room_not_found" };
  if (room.status !== "lobby") return { error: "room_not_in_lobby" };

  const existing = room.players.find((p) => p.id === playerId);
  if (existing) {
    // Reconnect case — update socket metadata only
    existing.connectionStatus = "connected";
    existing.socketId = socketId;
    roomStore.set(code, room);
    return { room: snapshot(room) };
  }

  if (room.players.length >= room.maxPlayers) return { error: "room_full" };

  const newPlayer: LobbyPlayer = {
    id: playerId,
    name: playerName,
    isHost: false,
    joinedAt: Date.now(),
    connectionStatus: "connected",
    socketId,
  };

  room.players.push(newPlayer);
  roomStore.set(code, room);
  return { room: snapshot(room) };
}

export function reconnectToRoom(
  code: string,
  playerId: string,
  socketId: string
): RoomResult {
  const room = roomStore.get(code);
  if (!room) return { error: "room_not_found" };

  const player = room.players.find((p) => p.id === playerId);
  if (!player) return { error: "player_not_in_room" };

  player.connectionStatus = "connected";
  player.socketId = socketId;
  roomStore.set(code, room);
  return { room: snapshot(room) };
}

export function leaveRoom(code: string, playerId: string): GameRoom | null {
  const room = roomStore.get(code);
  if (!room) return null;

  room.players = room.players.filter((p) => p.id !== playerId);

  if (room.players.length === 0) {
    roomStore.delete(code);
    return null;
  }

  // Promote a new host if the host left
  if (room.hostId === playerId) {
    room.players[0].isHost = true;
    room.hostId = room.players[0].id;
  }

  roomStore.set(code, room);
  return snapshot(room);
}

export function kickPlayer(
  code: string,
  hostId: string,
  targetId: string
): RoomResult {
  const room = roomStore.get(code);
  if (!room) return { error: "room_not_found" };
  if (room.hostId !== hostId) return { error: "not_host" };

  room.players = room.players.filter((p) => p.id !== targetId);
  roomStore.set(code, room);
  return { room: snapshot(room) };
}

export function startRoom(code: string, hostId: string): RoomResult {
  const room = roomStore.get(code);
  if (!room) return { error: "room_not_found" };
  if (room.hostId !== hostId) return { error: "not_host" };

  room.status = "setup";
  roomStore.set(code, room);
  return { room: snapshot(room) };
}

export function markDisconnected(
  code: string,
  playerId: string
): GameRoom | null {
  const room = roomStore.get(code);
  if (!room) return null;

  const player = room.players.find((p) => p.id === playerId);
  if (player) {
    player.connectionStatus = "disconnected";
    player.socketId = undefined;
    roomStore.set(code, room);
  }
  return snapshot(room);
}

export function getRoom(code: string): GameRoom | undefined {
  const room = roomStore.get(code);
  return room ? snapshot(room) : undefined;
}
