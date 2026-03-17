import type { AIDifficulty, DonationEntry, FogOfWarState, LogEntry, MapSize, PeaceOffer, PeacePairMemory, PeaceResolution, PeaceTreaty, Player, PlayerColor, RankingEntry, ReinforcementRequest, TechNodeId, Tile, Unit, UnitType, Village } from "../game/types";

export type MatchPhase = "lobby" | "setup" | "in_game" | "finished";

export type MatchWinner = {
  playerId: string;
  color: PlayerColor;
  reason: string;
};

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
  /** gamePlayerId -> lobbyPlayerId */
  playerAssignments: Record<string, string>;
  /** lobbyPlayerId -> gamePlayerId */
  lobbyToGamePlayer: Record<string, string>;
  aiPlayerIds: string[];
  aiDifficulty: AIDifficulty;
  players: Player[];
  map: MatchMapState;
  villages: Village[];
  units: Unit[];
  exploredTiles: FogOfWarState;
  visibleTiles: FogOfWarState;
  /** Backward-compatible alias for explored tiles */
  fogOfWar: FogOfWarState;
  lastCombatTurnByPair: Record<string, number>;
  factionContactPairs: string[];
  /** Per player: discovered opposing factions */
  contactedPlayerIdsByPlayer: Record<string, string[]>;
  /** Per player: transient first-contact banner color */
  firstContactNotificationByPlayer: Record<string, PlayerColor | null>;
  /** Perspective-projected helper (filled in getPerspectiveState) */
  contactedPlayerIds: string[];
  /** Perspective-projected helper (filled in getPerspectiveState) */
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
  /** Transient: tile keys hidden from each observer player during the last unit action (cleared each action) */
  hiddenMoveTileKeys: Record<string, string[]>;
  gameLog: LogEntry[];
  diplomacyLog: LogEntry[];
  aiPeaceDebugLog: string[];
  gameOver: boolean;
  gameOverReason: string | null;
  ranking: RankingEntry[];
  winner: MatchWinner | null;
};

export type MatchServerConfig = {
  roomCode: string;
  mapSize: MapSize;
  aiCount: number;
  aiDifficulty: AIDifficulty;
  seed?: number;
  hostColorPreference?: PlayerColor;
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

export type MatchCreatePayload = {
  roomCode: string;
  hostId: string;
};

export type MatchActionPayload = {
  roomCode: string;
  lobbyPlayerId: string;
  action: GameAction;
};

export type MatchReconnectPayload = {
  roomCode: string;
  lobbyPlayerId: string;
};

export type MatchCreatedEvent = {
  matchState: MatchState;
};

export type MatchUpdatedEvent = {
  matchState: MatchState;
};

export type MatchErrorEvent = {
  event: string;
  error: string;
};
