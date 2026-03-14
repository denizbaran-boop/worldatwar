import { createInitialPeaceMemories } from "../game/diplomacy";
import { createInitialGameState } from "../game/gameState";
import { PLAYER_COLORS } from "../game/constants";
import { createInitialFog, revealAroundAllUnits } from "../game/fogOfWar";
import type { AIDifficulty, MapSize, PlayerColor, Tile, Unit, Village } from "../game/types";
import { makeId } from "../game/utils";
import type { GameRoom, RoomGameConfig } from "../types";
import { applyGameAction, runAISteps } from "../actions/matchActions";
import { matchStore } from "./matchStore";
import type { GameAction, MatchServerConfig, MatchState } from "./matchTypes";

type MatchResult = { match?: MatchState; error?: string };

const defaultConfig = (): RoomGameConfig => ({
  mapSize: "medium",
  aiCount: 0,
  aiDifficulty: "normal",
  seed: Date.now(),
  hostColorPreference: "blue",
  updatedAt: Date.now()
});

const normalizeConfig = (config?: RoomGameConfig): RoomGameConfig => {
  const merged = { ...defaultConfig(), ...(config ?? {}) };
  const maxAi = Math.max(0, 5 - 1);
  return {
    ...merged,
    aiCount: Math.max(0, Math.min(maxAi, merged.aiCount))
  };
};

const computeVisible = (playerIds: string[], units: Unit[], tiles: Tile[]) => {
  const base = createInitialFog(playerIds);
  return revealAroundAllUnits(base, units, tiles, 1);
};

const applyFogFilterToTile = (tile: Tile, discovered: boolean): Tile => {
  if (discovered) return tile;
  return {
    ...tile,
    ownerId: null,
    isCapital: false,
    hasGoldMine: false,
    villageId: null,
    controlledByVillageId: null
  };
};

const filterVillagesForPerspective = (villages: Village[], visibleTileKeys: Record<string, boolean>) =>
  villages.map((village) =>
    visibleTileKeys[village.tileKey]
      ? village
      : {
          ...village,
          ownerId: null,
          controlledTileKeys: []
        }
  );

const lobbyPlayerOrder = (room: GameRoom) =>
  [...room.players].sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));

const assignColors = (humans: number, config: RoomGameConfig): PlayerColor[] => {
  const preferred = config.hostColorPreference ?? PLAYER_COLORS[0];
  const orderedBase = [preferred, ...PLAYER_COLORS.filter((entry) => entry !== preferred)] as PlayerColor[];
  const needed = humans + config.aiCount;
  return orderedBase.slice(0, needed);
};

export const buildMatchConfigFromRoom = (room: GameRoom): MatchServerConfig => {
  const cfg = normalizeConfig(room.gameConfig);
  return {
    roomCode: room.code,
    mapSize: cfg.mapSize,
    aiCount: cfg.aiCount,
    aiDifficulty: cfg.aiDifficulty,
    seed: cfg.seed,
    hostColorPreference: cfg.hostColorPreference
  };
};

export const createMatchForRoom = (room: GameRoom, hostId: string): MatchResult => {
  if (room.hostId !== hostId) return { error: "not_host" };
  if (room.status !== "setup") return { error: "room_not_in_setup" };

  const cfg = buildMatchConfigFromRoom(room);
  const orderedLobbyPlayers = lobbyPlayerOrder(room);
  const colors = assignColors(orderedLobbyPlayers.length, normalizeConfig(room.gameConfig));

  const initial = createInitialGameState({
    playerCount: colors.length,
    colors,
    mapSize: cfg.mapSize,
    seed: cfg.seed,
    aiPlayerIds: []
  });

  const playerAssignments: Record<string, string> = {};
  const lobbyToGamePlayer: Record<string, string> = {};

  for (let i = 0; i < orderedLobbyPlayers.length; i += 1) {
    const lobbyPlayer = orderedLobbyPlayers[i];
    const gamePlayer = initial.players[i];
    if (!gamePlayer) continue;
    playerAssignments[gamePlayer.id] = lobbyPlayer.id;
    lobbyToGamePlayer[lobbyPlayer.id] = gamePlayer.id;
  }

  const aiPlayerIds = initial.players
    .slice(orderedLobbyPlayers.length)
    .map((player) => player.id);

  const visibleTiles = computeVisible(initial.players.map((player) => player.id), initial.units, initial.tiles);
  const exploredTiles = initial.fogOfWar;

  const base: MatchState = {
    matchId: makeId("match"),
    roomCode: room.code,
    phase: "in_game",
    turnNumber: 1,
    currentPlayerId: initial.players[0]?.id ?? "player_1",
    currentFaction: initial.players[0]?.color ?? "blue",
    playerAssignments,
    lobbyToGamePlayer,
    aiPlayerIds,
    aiDifficulty: cfg.aiDifficulty,
    players: initial.players,
    map: {
      tiles: initial.tiles,
      seed: initial.seed,
      mapSize: cfg.mapSize
    },
    villages: initial.villages,
    units: initial.units,
    exploredTiles,
    visibleTiles,
    fogOfWar: exploredTiles,
    lastCombatTurnByPair: {},
    factionContactPairs: [],
    contactedPlayerIdsByPlayer: Object.fromEntries(initial.players.map((player) => [player.id, []])),
    firstContactNotificationByPlayer: Object.fromEntries(initial.players.map((player) => [player.id, null])),
    contactedPlayerIds: [],
    firstContactNotification: null,
    peaceTreaties: [],
    peaceMemories: createInitialPeaceMemories(initial.players, initial.tiles, initial.units, initial.villages, 1),
    outgoingTreaty: null,
    pendingPeaceTreaty: null,
    pendingTreatyResult: null,
    justBrokePeace: [],
    reinforcementRequest: null,
    reinforcementCooldowns: {},
    unitDonorColors: {},
    gameLog: [createLog(1, "Match started")],
    diplomacyLog: [],
    aiPeaceDebugLog: [],
    gameOver: false,
    gameOverReason: null,
    ranking: [],
    winner: null
  };

  const match = runAISteps(base);
  matchStore.set(room.code, match);
  return { match };
};

const createLog = (turn: number, text: string): { id: string; turn: number; text: string } => ({
  id: makeId("log"),
  turn,
  text
});

export const getMatch = (roomCode: string) => matchStore.get(roomCode);

export const removeMatch = (roomCode: string) => {
  matchStore.delete(roomCode);
};

export const getPerspectiveState = (match: MatchState, lobbyPlayerId: string): MatchState => {
  const gamePlayerId = match.lobbyToGamePlayer[lobbyPlayerId];
  if (!gamePlayerId) return match;

  const visibleForPlayer = match.visibleTiles[gamePlayerId] ?? {};
  const exploredForPlayer = match.exploredTiles[gamePlayerId] ?? {};

  const filteredTiles = match.map.tiles.map((tile) =>
    applyFogFilterToTile(tile, Boolean(exploredForPlayer[tile.key]))
  );

  const filteredUnits = match.units.filter((unit) => {
    if (unit.ownerId === gamePlayerId) return true;
    return Boolean(visibleForPlayer[unit.tileKey]);
  });

  const filteredVillages = filterVillagesForPerspective(match.villages, exploredForPlayer);
  const contactedPlayerIds = match.contactedPlayerIdsByPlayer[gamePlayerId] ?? [];
  const firstContactNotification = match.firstContactNotificationByPlayer[gamePlayerId] ?? null;
  const pendingOffer = match.pendingPeaceTreaty;
  const outgoingTreaty =
    pendingOffer && pendingOffer.fromPlayerId === gamePlayerId ? pendingOffer : null;
  const pendingPeaceTreaty =
    pendingOffer && pendingOffer.toPlayerId === gamePlayerId ? pendingOffer : null;

  return {
    ...match,
    map: {
      ...match.map,
      tiles: filteredTiles
    },
    villages: filteredVillages,
    units: filteredUnits,
    exploredTiles: {
      [gamePlayerId]: exploredForPlayer
    },
    visibleTiles: {
      [gamePlayerId]: visibleForPlayer
    },
    fogOfWar: {
      [gamePlayerId]: exploredForPlayer
    },
    contactedPlayerIdsByPlayer: {
      [gamePlayerId]: contactedPlayerIds
    },
    firstContactNotificationByPlayer: {
      [gamePlayerId]: firstContactNotification
    },
    contactedPlayerIds,
    firstContactNotification,
    outgoingTreaty,
    pendingPeaceTreaty
  };
};

export const applyMatchAction = (
  roomCode: string,
  lobbyPlayerId: string,
  action: GameAction
): MatchResult => {
  const match = matchStore.get(roomCode);
  if (!match) return { error: "match_not_found" };

  const gamePlayerId = match.lobbyToGamePlayer[lobbyPlayerId];
  if (!gamePlayerId) return { error: "player_not_in_match" };

  const result = applyGameAction(match, gamePlayerId, action);
  if (!result.ok) return { error: result.error };

  matchStore.set(roomCode, result.match);
  return { match: result.match };
};

export const updateRoomSetupConfig = (
  room: GameRoom,
  hostId: string,
  updates: Partial<RoomGameConfig>
): MatchResult & { config?: RoomGameConfig } => {
  if (room.hostId !== hostId) return { error: "not_host" };
  const merged = normalizeConfig({ ...(room.gameConfig ?? defaultConfig()), ...updates, updatedAt: Date.now() });
  return { config: merged };
};

export const getGamePlayerIdForLobby = (match: MatchState, lobbyPlayerId: string) =>
  match.lobbyToGamePlayer[lobbyPlayerId] ?? null;

export const toMapSize = (value: unknown): MapSize => {
  if (value === "small" || value === "medium" || value === "large") return value;
  return "medium";
};

export const toDifficulty = (value: unknown): AIDifficulty => {
  if (value === "easy" || value === "normal" || value === "hard") return value;
  return "normal";
};
