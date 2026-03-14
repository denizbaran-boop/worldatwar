import type {
  AIDifficulty,
  DonationEntry,
  FogOfWarState,
  LogEntry,
  MapSize,
  PeaceOffer,
  PeacePairMemory,
  PeaceResolution,
  PeaceTreaty,
  Player,
  PlayerColor,
  RankingEntry,
  ReinforcementRequest,
  TechNodeId,
  Tile,
  Unit,
  UnitType,
  Village
} from "@/lib/game/types";

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

export type RoomErrorCode =
  | "room_not_found"
  | "room_full"
  | "room_not_in_lobby"
  | "room_not_in_setup"
  | "not_host"
  | "player_not_in_room"
  | "unknown_error";

export type RoomErrorPayload = { event: string; error: RoomErrorCode };
export type KickedPayload = { room: GameRoom; kickedId: string };

export type MatchPhase = "lobby" | "setup" | "in_game" | "finished";

export type MatchMapState = {
  tiles: Tile[];
  seed: number;
  mapSize: MapSize;
};

export type MatchState = {
  matchId: string;
  roomCode: string;
  phase: MatchPhase;
  turnNumber: number;
  currentPlayerId: string;
  currentFaction: PlayerColor;
  playerAssignments: Record<string, string>;
  lobbyToGamePlayer: Record<string, string>;
  aiPlayerIds: string[];
  aiDifficulty: AIDifficulty;
  players: Player[];
  map: MatchMapState;
  villages: Village[];
  units: Unit[];
  exploredTiles: FogOfWarState;
  visibleTiles: FogOfWarState;
  fogOfWar: FogOfWarState;
  lastCombatTurnByPair: Record<string, number>;
  factionContactPairs: string[];
  contactedPlayerIdsByPlayer: Record<string, string[]>;
  firstContactNotificationByPlayer: Record<string, PlayerColor | null>;
  contactedPlayerIds: string[];
  firstContactNotification: PlayerColor | null;
  peaceTreaties: PeaceTreaty[];
  peaceMemories: Record<string, PeacePairMemory>;
  outgoingTreaty: PeaceOffer | null;
  pendingPeaceTreaty: PeaceOffer | null;
  pendingTreatyResult: PeaceResolution | null;
  justBrokePeace: string[];
  reinforcementRequest: ReinforcementRequest | null;
  reinforcementCooldowns: Record<string, number>;
  unitDonorColors: Record<string, PlayerColor>;
  gameLog: LogEntry[];
  diplomacyLog: LogEntry[];
  aiPeaceDebugLog: string[];
  gameOver: boolean;
  gameOverReason: string | null;
  ranking: RankingEntry[];
  winner: { playerId: string; color: PlayerColor; reason: string } | null;
};

export type GameAction =
  | { type: "unit_action"; unitId: string; targetTileKey: string }
  | { type: "produce_unit"; unitType: UnitType; tileKey: string }
  | { type: "unlock_tech"; techId: TechNodeId }
  | { type: "heal_unit"; unitId: string }
  | { type: "send_peace"; toPlayerId: string }
  | { type: "respond_peace"; accept: boolean }
  | { type: "send_reinforcement"; toPlayerId: string }
  | { type: "respond_reinforcement"; accept: boolean }
  | { type: "submit_donation"; entries: DonationEntry[] }
  | { type: "break_peace"; toPlayerId: string }
  | { type: "surrender" }
  | { type: "end_turn" };
