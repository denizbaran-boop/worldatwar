import { applyGameAction } from "../src/actions/matchActions";
import { createInitialFog } from "../src/game/fogOfWar";
import { getPerspectiveState } from "../src/match/matchManager";
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
  contactedPlayerIdsByPlayer?: Record<string, string[]>;
}): MatchState {
  const { players, tiles, units, villages = [], currentPlayerId, contactedPlayerIdsByPlayer } = input;
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
    contactedPlayerIdsByPlayer:
      contactedPlayerIdsByPlayer ?? Object.fromEntries(players.map((p) => [p.id, []])),
    firstContactNotificationByPlayer: Object.fromEntries(players.map((p) => [p.id, null])),
    contactedPlayerIds: [],
    firstContactNotification: null,
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

function makeTwoPlayerPeaceMatch() {
  const players = makePlayers(["player_1", "player_2"]);
  const tiles: Tile[] = [
    { key: "0,0", q: 0, r: 0, ownerId: "player_1", isCapital: true, hasGoldMine: false, villageId: null, controlledByVillageId: null },
    { key: "1,0", q: 1, r: 0, ownerId: "player_2", isCapital: true, hasGoldMine: false, villageId: null, controlledByVillageId: null }
  ];
  const units: Unit[] = [
    { id: "u1", ownerId: "player_1", tileKey: "0,0", type: "basic_soldier", health: 2, hasMovedThisTurn: false, hasAttackedThisTurn: false, movesUsed: 0 },
    { id: "u2", ownerId: "player_2", tileKey: "1,0", type: "basic_soldier", health: 2, hasMovedThisTurn: false, hasAttackedThisTurn: false, movesUsed: 0 }
  ];
  return makeBaseMatch({
    players,
    tiles,
    units,
    currentPlayerId: "player_1",
    contactedPlayerIdsByPlayer: {
      player_1: ["player_2"],
      player_2: ["player_1"]
    }
  });
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

function testFirstContactSyncAndReconnect() {
  const players = makePlayers(["player_1", "player_2"]);
  const tiles: Tile[] = [
    { key: "0,0", q: 0, r: 0, ownerId: "player_1", isCapital: true, hasGoldMine: false, villageId: null, controlledByVillageId: null },
    { key: "1,0", q: 1, r: 0, ownerId: "player_2", isCapital: true, hasGoldMine: false, villageId: null, controlledByVillageId: null },
    { key: "0,1", q: 0, r: 1, ownerId: null, isCapital: false, hasGoldMine: false, villageId: null, controlledByVillageId: null }
  ];
  const units: Unit[] = [
    { id: "u1", ownerId: "player_1", tileKey: "0,0", type: "basic_soldier", health: 2, hasMovedThisTurn: false, hasAttackedThisTurn: false, movesUsed: 0 },
    { id: "u2", ownerId: "player_2", tileKey: "1,0", type: "basic_soldier", health: 2, hasMovedThisTurn: false, hasAttackedThisTurn: false, movesUsed: 0 }
  ];

  const match = makeBaseMatch({ players, tiles, units, currentPlayerId: "player_1" });
  const moved = applyGameAction(match, "player_1", { type: "unit_action", unitId: "u1", targetTileKey: "0,1" });
  assert(moved.ok, "movement for first-contact setup should succeed");
  if (!moved.ok) return;

  const player1Known = moved.match.contactedPlayerIdsByPlayer["player_1"] ?? [];
  assert(player1Known.includes("player_2"), "discovering player must register first contact on server state");
  assert(
    moved.match.firstContactNotificationByPlayer["player_1"] === "red",
    "discovering player should receive first contact notification color"
  );

  const perspective = getPerspectiveState(moved.match, "lobby_1");
  assert(
    perspective.contactedPlayerIds.includes("player_2"),
    "perspective snapshot should include contacted factions for reconnect"
  );
  assert(
    perspective.firstContactNotification === "red",
    "perspective snapshot should include first contact notification"
  );
}

function testPeaceTreatyPendingAndTurnGatedDelivery() {
  const match = makeTwoPlayerPeaceMatch();
  const sent = applyGameAction(match, "player_1", { type: "send_peace", toPlayerId: "player_2" });
  assert(sent.ok, "send peace should succeed when factions have contact");
  if (!sent.ok) return;

  assert(Boolean(sent.match.pendingPeaceTreaty), "pending peace treaty must be stored on server");

  const senderView = getPerspectiveState(sent.match, "lobby_1");
  assert(
    senderView.outgoingTreaty?.toPlayerId === "player_2",
    "sender perspective should expose outgoing treaty waiting state"
  );
  assert(senderView.pendingPeaceTreaty === null, "sender should not receive incoming peace modal");

  const receiverBeforeTurn = getPerspectiveState(sent.match, "lobby_2");
  assert(
    receiverBeforeTurn.pendingPeaceTreaty === null,
    "receiver should not see actionable pending treaty before their turn"
  );

  const advanced = applyGameAction(sent.match, "player_1", { type: "end_turn" });
  assert(advanced.ok, "end turn after sending peace should succeed");
  if (!advanced.ok) return;
  assert(advanced.match.currentPlayerId === "player_2", "turn should advance to peace target");

  const receiverOnTurn = getPerspectiveState(advanced.match, "lobby_2");
  assert(
    receiverOnTurn.pendingPeaceTreaty?.fromPlayerId === "player_1",
    "receiver should get pending peace treaty on their turn"
  );
}

function testPeaceTreatyRespondAcceptAndReject() {
  const base = makeTwoPlayerPeaceMatch();
  const sent = applyGameAction(base, "player_1", { type: "send_peace", toPlayerId: "player_2" });
  assert(sent.ok, "peace send should succeed before accept test");
  if (!sent.ok) return;
  const toResponderTurn = applyGameAction(sent.match, "player_1", { type: "end_turn" });
  assert(toResponderTurn.ok, "turn advance should succeed before accept test");
  if (!toResponderTurn.ok) return;

  const accepted = applyGameAction(toResponderTurn.match, "player_2", { type: "respond_peace", accept: true });
  assert(accepted.ok, "peace accept should succeed");
  if (!accepted.ok) return;
  assert(accepted.match.pendingPeaceTreaty === null, "pending treaty should clear after accept");
  assert(
    accepted.match.peaceTreaties.some(
      (entry) =>
        (entry.playerA === "player_1" && entry.playerB === "player_2") ||
        (entry.playerA === "player_2" && entry.playerB === "player_1")
    ),
    "accepted response should create peace treaty"
  );

  const baseReject = makeTwoPlayerPeaceMatch();
  const sentReject = applyGameAction(baseReject, "player_1", { type: "send_peace", toPlayerId: "player_2" });
  assert(sentReject.ok, "peace send should succeed before reject test");
  if (!sentReject.ok) return;
  const toResponderTurnReject = applyGameAction(sentReject.match, "player_1", { type: "end_turn" });
  assert(toResponderTurnReject.ok, "turn advance should succeed before reject test");
  if (!toResponderTurnReject.ok) return;

  const rejected = applyGameAction(toResponderTurnReject.match, "player_2", { type: "respond_peace", accept: false });
  assert(rejected.ok, "peace reject should succeed");
  if (!rejected.ok) return;
  assert(rejected.match.pendingPeaceTreaty === null, "pending treaty should clear after reject");
  assert(rejected.match.peaceTreaties.length === 0, "reject should not create treaty");
}

function testPeaceTreatyAutoRejectOnTargetEndTurn() {
  const match = makeTwoPlayerPeaceMatch();
  const sent = applyGameAction(match, "player_1", { type: "send_peace", toPlayerId: "player_2" });
  assert(sent.ok, "peace send should succeed before auto reject test");
  if (!sent.ok) return;
  const toResponderTurn = applyGameAction(sent.match, "player_1", { type: "end_turn" });
  assert(toResponderTurn.ok, "turn advance should succeed before auto reject test");
  if (!toResponderTurn.ok) return;

  const skipped = applyGameAction(toResponderTurn.match, "player_2", { type: "end_turn" });
  assert(skipped.ok, "target ending turn without response should succeed");
  if (!skipped.ok) return;
  assert(skipped.match.pendingPeaceTreaty === null, "pending peace must not get stuck forever");
  assert(
    skipped.match.gameLog.some((entry) => entry.text.includes("rejected peace from")),
    "auto-reject should produce synchronized log entry"
  );
}

function main() {
  testCapitalCaptureElimination();
  testSurrenderOwnTurn();
  testSurrenderOtherTurnAndTurnOrder();
  testFirstContactSyncAndReconnect();
  testPeaceTreatyPendingAndTurnGatedDelivery();
  testPeaceTreatyRespondAcceptAndReject();
  testPeaceTreatyAutoRejectOnTargetEndTurn();
  console.log("multiplayer regression checks: PASS");
}

main();
