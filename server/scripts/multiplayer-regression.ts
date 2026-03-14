import { applyGameAction } from "../src/actions/matchActions";
import { createInitialFog } from "../src/game/fogOfWar";
import type { MatchState } from "../src/match/matchTypes";
import type { Player, Tile, Unit, Village } from "../src/game/types";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function makePlayers(ids: string[]): Player[] {
  const colors = ["blue", "red", "green", "purple", "yellow"] as const;
  return ids.map((id, i) => ({
    id,
    color: colors[i],
    gold: 100,
    isAlive: true,
    unlockedTechIds: ["military_basics"]
  }));
}

function makeBaseMatch(input: {
  players: Player[];
  tiles: Tile[];
  units: Unit[];
  villages?: Village[];
  currentPlayerId: string;
}): MatchState {
  const { players, tiles, units, villages = [], currentPlayerId } = input;
  const fog = createInitialFog(players.map((p) => p.id));
  const lobbyToGamePlayer = Object.fromEntries(players.map((p, i) => [`lobby_${i + 1}`, p.id]));
  const playerAssignments = Object.fromEntries(players.map((p, i) => [p.id, `lobby_${i + 1}`]));
  return {
    matchId: "match_regression",
    roomCode: "REG001",
    phase: "in_game",
    turnNumber: 1,
    currentPlayerId,
    currentFaction: players.find((p) => p.id === currentPlayerId)?.color ?? "blue",
    playerAssignments,
    lobbyToGamePlayer,
    aiPlayerIds: [],
    aiDifficulty: "normal",
    players,
    map: { tiles, seed: 1, mapSize: "small" },
    villages,
    units,
    exploredTiles: fog,
    visibleTiles: fog,
    fogOfWar: fog,
    lastCombatTurnByPair: {},
    factionContactPairs: [],
    peaceTreaties: [],
    peaceMemories: {},
    outgoingTreaty: null,
    pendingPeaceTreaty: null,
    pendingTreatyResult: null,
    justBrokePeace: [],
    reinforcementRequest: null,
    reinforcementCooldowns: {},
    unitDonorColors: {},
    gameLog: [],
    diplomacyLog: [],
    aiPeaceDebugLog: [],
    gameOver: false,
    gameOverReason: null,
    ranking: [],
    winner: null
  };
}

function testCapitalCaptureElimination() {
  const players = makePlayers(["player_1", "player_2"]);
  const tiles: Tile[] = [
    { key: "0,0", q: 0, r: 0, ownerId: "player_1", isCapital: true, hasGoldMine: false, villageId: null, controlledByVillageId: null },
    { key: "1,0", q: 1, r: 0, ownerId: "player_2", isCapital: true, hasGoldMine: false, villageId: null, controlledByVillageId: null }
  ];
  const units: Unit[] = [
    { id: "u1", ownerId: "player_1", tileKey: "0,0", type: "basic_soldier", health: 2, hasMovedThisTurn: false, hasAttackedThisTurn: false, movesUsed: 0 }
  ];

  const match = makeBaseMatch({ players, tiles, units, currentPlayerId: "player_1" });
  const result = applyGameAction(match, "player_1", { type: "unit_action", unitId: "u1", targetTileKey: "1,0" });
  assert(result.ok, "capital capture action should succeed");
  if (!result.ok) return;

  const defeated = result.match.players.find((p) => p.id === "player_2");
  assert(defeated && !defeated.isAlive, "captured capital owner must be eliminated");
  assert(result.match.gameOver, "match should end when only one commander remains");
  assert(result.match.winner?.playerId === "player_1", "attacker should be winner after elimination");
}

function testSurrenderOwnTurn() {
  const players = makePlayers(["player_1", "player_2"]);
  const tiles: Tile[] = [
    { key: "0,0", q: 0, r: 0, ownerId: "player_1", isCapital: true, hasGoldMine: false, villageId: null, controlledByVillageId: null },
    { key: "1,0", q: 1, r: 0, ownerId: "player_2", isCapital: true, hasGoldMine: false, villageId: null, controlledByVillageId: null }
  ];
  const units: Unit[] = [
    { id: "u1", ownerId: "player_1", tileKey: "0,0", type: "basic_soldier", health: 2, hasMovedThisTurn: false, hasAttackedThisTurn: false, movesUsed: 0 },
    { id: "u2", ownerId: "player_2", tileKey: "1,0", type: "basic_soldier", health: 2, hasMovedThisTurn: false, hasAttackedThisTurn: false, movesUsed: 0 }
  ];

  const match = makeBaseMatch({ players, tiles, units, currentPlayerId: "player_1" });
  const result = applyGameAction(match, "player_1", { type: "surrender" });
  assert(result.ok, "surrender should succeed on own turn");
  if (!result.ok) return;

  assert(result.match.gameOver, "2-player match should end when one player surrenders");
  assert(result.match.winner?.playerId === "player_2", "remaining commander should win after surrender");
  assert(result.match.currentPlayerId === "player_2", "turn should advance away from surrendering player");
}

function testSurrenderOtherTurnAndTurnOrder() {
  const players = makePlayers(["player_1", "player_2", "player_3"]);
  const tiles: Tile[] = [
    { key: "0,0", q: 0, r: 0, ownerId: "player_1", isCapital: true, hasGoldMine: false, villageId: null, controlledByVillageId: null },
    { key: "1,0", q: 1, r: 0, ownerId: "player_2", isCapital: true, hasGoldMine: false, villageId: null, controlledByVillageId: null },
    { key: "2,0", q: 2, r: 0, ownerId: "player_3", isCapital: true, hasGoldMine: false, villageId: null, controlledByVillageId: null }
  ];
  const units: Unit[] = [
    { id: "u1", ownerId: "player_1", tileKey: "0,0", type: "basic_soldier", health: 2, hasMovedThisTurn: false, hasAttackedThisTurn: false, movesUsed: 0 },
    { id: "u2", ownerId: "player_2", tileKey: "1,0", type: "basic_soldier", health: 2, hasMovedThisTurn: false, hasAttackedThisTurn: false, movesUsed: 0 },
    { id: "u3", ownerId: "player_3", tileKey: "2,0", type: "basic_soldier", health: 2, hasMovedThisTurn: false, hasAttackedThisTurn: false, movesUsed: 0 }
  ];

  const match = makeBaseMatch({ players, tiles, units, currentPlayerId: "player_1" });
  const surrendered = applyGameAction(match, "player_2", { type: "surrender" });
  assert(surrendered.ok, "surrender should be accepted outside own turn");
  if (!surrendered.ok) return;

  assert(!surrendered.match.gameOver, "3-player match should continue after one surrender");
  assert(surrendered.match.currentPlayerId === "player_1", "current turn should remain with active player");
  assert(!surrendered.match.players.find((p) => p.id === "player_2")?.isAlive, "surrendered player must be eliminated");

  const afterEndTurn = applyGameAction(surrendered.match, "player_1", { type: "end_turn" });
  assert(afterEndTurn.ok, "end turn should succeed after off-turn surrender");
  if (!afterEndTurn.ok) return;

  assert(afterEndTurn.match.currentPlayerId === "player_3", "turn order must skip surrendered commander");
}

function main() {
  testCapitalCaptureElimination();
  testSurrenderOwnTurn();
  testSurrenderOtherTurnAndTurnOrder();
  console.log("multiplayer regression checks: PASS");
}

main();
