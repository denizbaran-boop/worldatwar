export type LobbyPlayer = {
  id: string;
  name: string;
  isHost: boolean;
};

export type GameRoom = {
  code: string;
  hostId: string;
  players: LobbyPlayer[];
  maxPlayers: number;
  createdAt: number;
};

// Module-level in-memory store — persists across component mounts within a session
const rooms = new Map<string, GameRoom>();

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function createRoom(hostId: string, hostName: string, maxPlayers = 6): GameRoom {
  let code: string;
  do {
    code = generateCode();
  } while (rooms.has(code));

  const room: GameRoom = {
    code,
    hostId,
    players: [{ id: hostId, name: hostName, isHost: true }],
    maxPlayers,
    createdAt: Date.now(),
  };

  rooms.set(code, room);
  return { ...room, players: [...room.players] };
}

export function joinRoom(code: string, playerId: string, playerName: string): GameRoom | null {
  const room = rooms.get(code.toUpperCase().trim());
  if (!room) return null;

  // Already in room
  if (room.players.find((p) => p.id === playerId)) {
    return { ...room, players: [...room.players] };
  }

  if (room.players.length >= room.maxPlayers) return null;

  room.players.push({ id: playerId, name: playerName, isHost: false });
  return { ...room, players: [...room.players] };
}

export function getRoom(code: string): GameRoom | null {
  const room = rooms.get(code.toUpperCase().trim());
  if (!room) return null;
  return { ...room, players: [...room.players] };
}

export function leaveRoom(code: string, playerId: string): GameRoom | null {
  const room = rooms.get(code);
  if (!room) return null;

  room.players = room.players.filter((p) => p.id !== playerId);

  if (room.players.length === 0) {
    rooms.delete(code);
    return null;
  }

  // If host left, promote first remaining player
  if (room.hostId === playerId) {
    room.players[0].isHost = true;
    room.hostId = room.players[0].id;
  }

  return { ...room, players: [...room.players] };
}

export function kickPlayer(code: string, hostId: string, targetId: string): GameRoom | null {
  const room = rooms.get(code);
  if (!room || room.hostId !== hostId) return null;

  room.players = room.players.filter((p) => p.id !== targetId);
  return { ...room, players: [...room.players] };
}

export function generatePlayerId(): string {
  return `player_${Math.random().toString(36).slice(2, 11)}`;
}
