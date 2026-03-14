import type { AIDifficulty, MapSize, PlayerColor } from "./game/types";

export type ConnectionStatus = "connected" | "disconnected";

export type RoomStatus = "lobby" | "setup" | "in_game" | "finished";

export type RoomGameConfig = {
  mapSize: MapSize;
  aiCount: number;
  aiDifficulty: AIDifficulty;
  seed?: number;
  hostColorPreference?: PlayerColor;
  updatedAt: number;
};

export type LobbyPlayer = {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: number;
  connectionStatus: ConnectionStatus;
  socketId?: string;
};

export type GameRoom = {
  code: string;
  hostId: string;
  status: RoomStatus;
  players: LobbyPlayer[];
  maxPlayers: number;
  createdAt: number;
  gameConfig?: RoomGameConfig;
};

// Socket event payloads

export type CreateRoomPayload = { playerName: string; playerId: string };
export type JoinRoomPayload = { code: string; playerName: string; playerId: string };
export type ReconnectPayload = { code: string; playerId: string };
export type LeaveRoomPayload = { code: string; playerId: string };
export type KickPayload = { code: string; hostId: string; targetId: string };
export type StartRoomPayload = { code: string; hostId: string };
export type UpdateRoomConfigPayload = {
  code: string;
  hostId: string;
  config: Partial<RoomGameConfig>;
};

export type RoomErrorPayload = { event: string; error: RoomErrorCode };
export type KickedPayload = { room: GameRoom; kickedId: string };

export type RoomErrorCode =
  | "room_not_found"
  | "room_full"
  | "room_not_in_lobby"
  | "room_not_in_setup"
  | "not_host"
  | "player_not_in_room"
  | "unknown_error";
