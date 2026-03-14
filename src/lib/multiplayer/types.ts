// Types that mirror the server-side models in server/src/types.ts.
// Keep these in sync manually (or extract to a shared package in a monorepo).

export type ConnectionStatus = "connected" | "disconnected";

export type RoomStatus = "lobby" | "setup" | "in_game" | "finished";

export type LobbyPlayer = {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: number;
  connectionStatus: ConnectionStatus;
};

export type GameRoom = {
  code: string;
  hostId: string;
  status: RoomStatus;
  players: LobbyPlayer[];
  maxPlayers: number;
  createdAt: number;
  /** Reserved for future shared game state synchronization */
  gameConfig?: Record<string, unknown>;
};

export type RoomErrorCode =
  | "room_not_found"
  | "room_full"
  | "room_not_in_lobby"
  | "not_host"
  | "player_not_in_room"
  | "unknown_error";

export type RoomErrorPayload = { event: string; error: RoomErrorCode };
export type KickedPayload    = { room: GameRoom; kickedId: string };
