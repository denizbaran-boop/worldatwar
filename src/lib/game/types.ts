export type PlayerColor = "blue" | "red" | "purple" | "green" | "yellow";
export type GameMode = "pvp" | "pvai";
export type AIDifficulty = "easy" | "normal" | "hard";
export type MapSize = "small" | "medium" | "large";

export type UnitType =
  | "basic_soldier"
  | "strong_soldier"
  | "warrior"
  | "machine_gunner"
  | "mortar"
  | "tank"
  | "aircraft"
  | "patriot"
  | "attack_helicopter";

export type UnitDomain = "ground" | "air";

export type TechNodeId =
  | "military_basics"
  | "strong_soldier"
  | "warrior"
  | "machine_gunner"
  | "mortar"
  | "tank"
  | "aircraft"
  | "patriot"
  | "attack_helicopter";

export type AxialCoord = {
  q: number;
  r: number;
};

export type Tile = AxialCoord & {
  key: string;
  ownerId: string | null;
  isCapital: boolean;
  hasGoldMine: boolean;
  villageId: string | null;
  controlledByVillageId: string | null;
};

export type Village = {
  id: string;
  tileKey: string;
  ownerId: string | null;
  controlledTileKeys: string[];
};

export type Unit = {
  id: string;
  ownerId: string;
  tileKey: string;
  type: UnitType;
  health: number;
  hasMovedThisTurn: boolean;
  hasAttackedThisTurn: boolean;
  movesUsed: number;
};

export type Player = {
  id: string;
  color: PlayerColor;
  gold: number;
  isAlive: boolean;
  unlockedTechIds: TechNodeId[];
};

export type FogOfWarState = Record<string, Record<string, boolean>>;

export type TechNode = {
  id: TechNodeId;
  name: string;
  cost: number;
  icon: string;
  prerequisites: TechNodeId[];
  unlockedUnitType: UnitType | null;
  gridX: number;
  gridY: number;
};

export type LogEntry = {
  id: string;
  turn: number;
  text: string;
  color?: PlayerColor;
};

export type RankingEntry = {
  playerId: string;
  color: PlayerColor;
  tileCount: number;
};

export type MatchConfig = {
  playerCount: number;
  colors: PlayerColor[];
  mapSize: MapSize;
  seed?: number;
  aiPlayerIds?: string[];
};

export type PeaceTreaty = {
  playerA: string;
  playerB: string;
};

export type DiplomacyPersonality = "aggressive" | "balanced" | "defensive" | "opportunistic";

export type PeaceOfferDirection = "human_outgoing" | "ai_outgoing";

export type PeaceOffer = {
  fromPlayerId: string;
  toPlayerId: string;
  fromColor: PlayerColor;
  toColor: PlayerColor;
  reason: string;
  score: number;
  turnSent: number;
  direction: PeaceOfferDirection;
};

export type PeaceResolution = {
  accepted: boolean;
  fromColor: PlayerColor;
  toPlayerId: string;
  reason: string;
  score: number;
};

export type PeacePairMemory = {
  lastOfferTurn: number | null;
  lastRejectedTurn: number | null;
  lastBrokenTurn: number | null;
  trustPenalty: number;
  lastMeaningfulChangeTurn: number;
  previousPlayerATileCount: number;
  previousPlayerBTileCount: number;
  previousPlayerAUnitCount: number;
  previousPlayerBUnitCount: number;
  previousPlayerAVillageCount: number;
  previousPlayerBVillageCount: number;
};

export type DonationEntry = {
  unitType: UnitType;
  quantity: number;
};

export type ReinforcementRequestStatus = "pending" | "donating" | "accepted" | "rejected";

export type ReinforcementRequest = {
  id: string;
  fromPlayerId: string;
  fromColor: PlayerColor;
  toPlayerId: string;
  toColor: PlayerColor;
  turnSent: number;
  status: ReinforcementRequestStatus;
  donatedEntries: DonationEntry[];
  totalGoldCost: number;
  turnResolved: number | null;
};
