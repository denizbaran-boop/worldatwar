"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { ActionPanel } from "@/components/game/ActionPanel";
import { CityProductionPanel } from "@/components/game/CityProductionPanel";
import { GameLog } from "@/components/game/GameLog";
import { PlayerSidebar } from "@/components/game/PlayerSidebar";
import { ReinforcementDonationModal } from "@/components/game/ReinforcementDonationModal";
import { TechTreeModal } from "@/components/game/TechTreeModal";
import { TechTreePanel } from "@/components/game/TechTreePanel";
import { TurnBanner } from "@/components/game/TurnBanner";
import { WorldMap } from "@/components/game/WorldMap";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useGameStore } from "@/store/gameStore";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { useRoom } from "@/lib/multiplayer/useRoom";
import { useMatch } from "@/lib/multiplayer/useMatch";
import type { GameAction } from "@/lib/multiplayer/types";

export function GamePageClient() {
  const router = useRouter();
  const { t } = useTranslation();
  const { room, localPlayerId } = useRoom();
  const multiplayerEnabled = Boolean(room && room.status === "in_game" && localPlayerId);
  const { match, syncing: matchSyncing, error: matchError, sendAction } = useMatch({
    roomCode: room?.code ?? null,
    lobbyPlayerId: localPlayerId,
    enabled: multiplayerEnabled
  });
  const {
    players,
    currentPlayerId,
    aiPlayerIds,
    aiTurnInProgress,
    actionAnimationBusy,
    runAITurn,
    logs,
    turnNumber,
    ranking,
    gameOver,
    gameOverReason,
    setup,
    resetToMenu,
    units,
    tiles,
    villages,
    fogOfWar,
    firstContactNotification,
    dismissFirstContact,
    diplomaticNotification,
    dismissDiplomaticNotification,
    treatyAcceptedNotification,
    dismissTreatyAccepted,
    pendingPeaceTreaty,
    respondToPeaceTreaty,
    reinforcementRequest,
    respondToReinforcementRequest,
    reinforcementNotification,
    dismissReinforcementNotification,
    contactedPlayerIds,
    humanPlayerId,
    diplomacyLog,
    lastCombatTurnByPair
  } = useGameStore(
    useShallow((state) => ({
      players: state.players,
      currentPlayerId: state.currentPlayerId,
      aiPlayerIds: state.aiPlayerIds,
      aiTurnInProgress: state.aiTurnInProgress,
      actionAnimationBusy: state.actionAnimationBusy,
      runAITurn: state.runAITurn,
      logs: state.logs,
      turnNumber: state.turnNumber,
      ranking: state.ranking,
      gameOver: state.gameOver,
      gameOverReason: state.gameOverReason,
      setup: state.setup,
      resetToMenu: state.resetToMenu,
      units: state.units,
      tiles: state.tiles,
      villages: state.villages,
      fogOfWar: state.fogOfWar,
      firstContactNotification: state.firstContactNotification,
      dismissFirstContact: state.dismissFirstContact,
      diplomaticNotification: state.diplomaticNotification,
      dismissDiplomaticNotification: state.dismissDiplomaticNotification,
      treatyAcceptedNotification: state.treatyAcceptedNotification,
      dismissTreatyAccepted: state.dismissTreatyAccepted,
      pendingPeaceTreaty: state.pendingPeaceTreaty,
      respondToPeaceTreaty: state.respondToPeaceTreaty,
      reinforcementRequest: state.reinforcementRequest,
      respondToReinforcementRequest: state.respondToReinforcementRequest,
      reinforcementNotification: state.reinforcementNotification,
      dismissReinforcementNotification: state.dismissReinforcementNotification,
      contactedPlayerIds: state.contactedPlayerIds,
      humanPlayerId: state.humanPlayerId,
      diplomacyLog: state.diplomacyLog,
      lastCombatTurnByPair: state.lastCombatTurnByPair
    }))
  );

  const currentPlayer = useMemo(() => players.find((player) => player.id === currentPlayerId) ?? null, [players, currentPlayerId]);
  const humanPlayer = useMemo(() => players.find((player) => player.id === humanPlayerId) ?? null, [players, humanPlayerId]);
  const humanEliminated = Boolean(humanPlayerId && humanPlayer && !humanPlayer.isAlive && !gameOver);
  const [watching, setWatching] = useState(false);
  const currentPlayerIsAI = Boolean(currentPlayerId && aiPlayerIds.includes(currentPlayerId));
  const multiplayerErrorText = useMemo(() => {
    if (!matchError) return null;
    if (matchError === "not_your_turn") return t.game.notYourTurn;
    if (matchError.startsWith("invalid_")) return t.game.invalidMove;
    return `${t.game.actionFailed}: ${matchError}`;
  }, [matchError, t.game.actionFailed, t.game.invalidMove, t.game.notYourTurn]);

  useEffect(() => {
    if (!multiplayerEnabled || !match || !localPlayerId) return;

    const localGamePlayerId = match.lobbyToGamePlayer[localPlayerId] ?? null;
    useGameStore.setState((state) => ({
      players: match.players,
      tiles: match.map.tiles,
      villages: match.villages,
      units: match.units,
      fogOfWar: match.fogOfWar,
      currentPlayerId: match.currentPlayerId,
      humanPlayerId: localGamePlayerId,
      aiPlayerIds: match.aiPlayerIds,
      turnNumber: match.turnNumber,
      logs: match.gameLog,
      diplomacyLog: match.diplomacyLog,
      lastCombatTurnByPair: match.lastCombatTurnByPair,
      factionContactPairs: match.factionContactPairs,
      peaceTreaties: match.peaceTreaties,
      peaceMemories: match.peaceMemories,
      outgoingTreaty: match.outgoingTreaty,
      pendingPeaceTreaty: match.pendingPeaceTreaty,
      pendingTreatyResult: match.pendingTreatyResult,
      justBrokePeace: match.justBrokePeace,
      reinforcementRequest: match.reinforcementRequest,
      reinforcementCooldowns: match.reinforcementCooldowns,
      unitDonorColors: match.unitDonorColors,
      aiPeaceDebugLog: match.aiPeaceDebugLog,
      gameOver: match.gameOver,
      gameOverReason: match.gameOverReason,
      ranking: match.ranking,
      setup: {
        ...state.setup,
        matchInitialized: true,
        gameMode: match.aiPlayerIds.length > 0 ? "pvai" : "pvp",
        aiDifficulty: match.aiDifficulty,
        mapSize: match.map.mapSize,
        playerCount: match.players.length
      }
    }));
  }, [localPlayerId, match, multiplayerEnabled]);

  useEffect(() => {
    if (!multiplayerEnabled) return;

    const original = useGameStore.getState();
    const dispatch = (action: GameAction) => sendAction(action);

    useGameStore.setState({
      attemptUnitAction: (unitId, targetTileKey) => {
        dispatch({ type: "unit_action", unitId, targetTileKey });
        return { ok: true };
      },
      queueAnimatedUnitAction: (unitId, targetTileKey) => {
        dispatch({ type: "unit_action", unitId, targetTileKey });
      },
      unlockTech: (techId) => {
        dispatch({ type: "unlock_tech", techId });
        return { ok: true };
      },
      produceUnit: (unitType, tileKey) => {
        dispatch({ type: "produce_unit", unitType, tileKey });
        return { ok: true };
      },
      healUnit: (unitId) => {
        dispatch({ type: "heal_unit", unitId });
        return { ok: true };
      },
      sendPeaceTreaty: (toPlayerId) => dispatch({ type: "send_peace", toPlayerId }),
      respondToPeaceTreaty: (accept) => dispatch({ type: "respond_peace", accept }),
      breakPeaceTreaty: (toPlayerId) => dispatch({ type: "break_peace", toPlayerId }),
      sendReinforcementRequest: (toPlayerId) => dispatch({ type: "send_reinforcement", toPlayerId }),
      respondToReinforcementRequest: (accept) => dispatch({ type: "respond_reinforcement", accept }),
      submitDonation: (entries) => dispatch({ type: "submit_donation", entries }),
      endTurn: () => dispatch({ type: "end_turn" }),
      runAITurn: async () => undefined
    });

    return () => {
      useGameStore.setState({
        attemptUnitAction: original.attemptUnitAction,
        queueAnimatedUnitAction: original.queueAnimatedUnitAction,
        unlockTech: original.unlockTech,
        produceUnit: original.produceUnit,
        healUnit: original.healUnit,
        sendPeaceTreaty: original.sendPeaceTreaty,
        respondToPeaceTreaty: original.respondToPeaceTreaty,
        breakPeaceTreaty: original.breakPeaceTreaty,
        sendReinforcementRequest: original.sendReinforcementRequest,
        respondToReinforcementRequest: original.respondToReinforcementRequest,
        submitDonation: original.submitDonation,
        endTurn: original.endTurn,
        runAITurn: original.runAITurn
      });
    };
  }, [multiplayerEnabled, sendAction]);

  useEffect(() => {
    (window as Window & { render_game_to_text?: () => string; advanceTime?: (ms: number) => void }).render_game_to_text = () =>
      JSON.stringify({
        note: "Axial coords with q rightward and r downward-right",
        turnNumber,
        currentPlayerId,
        gameOver,
        actionAnimationBusy,
        matchInitialized: setup.matchInitialized,
        mapSize: setup.mapSize,
        players: players.map((player) => ({
          id: player.id,
          color: player.color,
          gold: player.gold,
          unlockedTechIds: player.unlockedTechIds
        })),
        diplomacyLog: diplomacyLog.map((entry) => ({
          turn: entry.turn,
          text: entry.text
        })),
        lastCombatTurnByPair,
        units: units.map((unit) => ({
          id: unit.id,
          ownerId: unit.ownerId,
          tileKey: unit.tileKey,
          type: unit.type,
          health: unit.health,
          hasMovedThisTurn: unit.hasMovedThisTurn,
          hasAttackedThisTurn: unit.hasAttackedThisTurn
        })),
        tiles: tiles.map((tile) => ({
          key: tile.key,
          ownerId: tile.ownerId,
          isCapital: tile.isCapital,
          hasGoldMine: tile.hasGoldMine,
          villageId: tile.villageId
        })),
        villages: villages.map((village) => ({
          id: village.id,
          tileKey: village.tileKey,
          ownerId: village.ownerId,
          controlledTileCount: village.controlledTileKeys.length
        })),
        visibleTileCount:
          currentPlayerId && fogOfWar[currentPlayerId]
            ? Object.values(fogOfWar[currentPlayerId]).filter(Boolean).length
            : 0
      });

    (window as Window & { advanceTime?: (ms: number) => void }).advanceTime = () => {
      // Turn-based strategy does not require frame stepping.
    };
  }, [actionAnimationBusy, currentPlayerId, diplomacyLog, fogOfWar, gameOver, lastCombatTurnByPair, players, setup.mapSize, setup.matchInitialized, tiles, turnNumber, units, villages]);

  useEffect(() => {
    if (multiplayerEnabled) return;
    if (!setup.matchInitialized || gameOver || !currentPlayerIsAI || aiTurnInProgress) return;
    void runAITurn();
  }, [aiTurnInProgress, currentPlayerIsAI, gameOver, multiplayerEnabled, runAITurn, setup.matchInitialized]);

  const contactDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!firstContactNotification) return;
    if (contactDismissRef.current) clearTimeout(contactDismissRef.current);
    contactDismissRef.current = setTimeout(() => dismissFirstContact(), 4000);
    return () => { if (contactDismissRef.current) clearTimeout(contactDismissRef.current); };
  }, [firstContactNotification, dismissFirstContact]);

  const diplomacyDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!diplomaticNotification) return;
    if (diplomacyDismissRef.current) clearTimeout(diplomacyDismissRef.current);
    diplomacyDismissRef.current = setTimeout(() => dismissDiplomaticNotification(), 5000);
    return () => { if (diplomacyDismissRef.current) clearTimeout(diplomacyDismissRef.current); };
  }, [diplomaticNotification, dismissDiplomaticNotification]);

  const treatyAcceptedDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!treatyAcceptedNotification) return;
    if (treatyAcceptedDismissRef.current) clearTimeout(treatyAcceptedDismissRef.current);
    treatyAcceptedDismissRef.current = setTimeout(() => dismissTreatyAccepted(), 5000);
    return () => { if (treatyAcceptedDismissRef.current) clearTimeout(treatyAcceptedDismissRef.current); };
  }, [treatyAcceptedNotification, dismissTreatyAccepted]);

  const reinforcementDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!reinforcementNotification) return;
    if (reinforcementDismissRef.current) clearTimeout(reinforcementDismissRef.current);
    reinforcementDismissRef.current = setTimeout(() => dismissReinforcementNotification(), 5000);
    return () => { if (reinforcementDismissRef.current) clearTimeout(reinforcementDismissRef.current); };
  }, [reinforcementNotification, dismissReinforcementNotification]);

  if (multiplayerEnabled && !match) {
    return (
      <main className="min-h-screen bg-[#050812] px-4 py-10">
        <div className="mx-auto flex min-h-[88vh] max-w-4xl items-center justify-center">
          <Card className="w-full max-w-xl border-slate-700/60 bg-slate-950/65 p-8 text-center">
            <h1 className="text-3xl font-bold text-white">{t.game.syncingState}</h1>
            <p className="mt-3 text-slate-300">{matchSyncing ? t.game.reconnectingToMatch : t.game.waitingForOtherPlayers}</p>
            {matchError && <p className="mt-3 text-rose-300">{t.game.actionFailed}: {matchError}</p>}
          </Card>
        </div>
      </main>
    );
  }

  if (!multiplayerEnabled && (!setup.matchInitialized || players.length === 0)) {
    return (
      <main className="min-h-screen bg-[#050812] px-4 py-10">
        <div className="mx-auto flex min-h-[88vh] max-w-4xl items-center justify-center">
          <Card className="w-full max-w-xl border-slate-700/60 bg-slate-950/65 p-8 text-center">
            <h1 className="text-3xl font-bold text-white">{t.game.noMatch}</h1>
            <p className="mt-3 text-slate-300">{t.game.noMatchDesc}</p>
            <div className="mt-6 flex justify-center gap-2">
              <Link href="/"><Button>{t.game.mainMenu}</Button></Link>
              <Link href="/setup"><Button variant="secondary">{t.game.setupMatch}</Button></Link>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050812] px-4 py-4">
      <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-4 xl:grid-cols-[300px_1fr_340px]">
        <aside className="space-y-4">
          <TurnBanner currentPlayer={currentPlayer} aiThinking={currentPlayerIsAI && aiTurnInProgress} />
          <PlayerSidebar />
        </aside>

        <section className="space-y-4">
          <WorldMap />
          <ActionPanel />
          <TechTreePanel />
        </section>

        <aside>
          <GameLog logs={logs} players={players} contactedPlayerIds={contactedPlayerIds} humanPlayerId={humanPlayerId} />
        </aside>
      </div>

      <TechTreeModal />
      <CityProductionPanel />
      <ReinforcementDonationModal />

      {firstContactNotification && (
        <div className="fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-lg border border-cyan-500/50 bg-slate-900/95 px-6 py-3 shadow-lg shadow-cyan-900/30 text-center">
          <p className="text-sm font-semibold capitalize text-cyan-100">
            {t.game.firstContactPrefix} <span className="text-cyan-300">{firstContactNotification}</span>
          </p>
          <button onClick={dismissFirstContact} className="mt-1 text-xs text-slate-400 hover:text-slate-200">{t.game.dismiss}</button>
        </div>
      )}

      {treatyAcceptedNotification && (
        <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-lg border border-emerald-500/50 bg-slate-900/95 px-6 py-3 shadow-lg shadow-emerald-900/30 text-center">
          <p className="text-sm font-semibold capitalize text-emerald-200">
            ☮ <span className="capitalize">{treatyAcceptedNotification}</span> {t.game.treatyAcceptedSuffix}
          </p>
          <button onClick={dismissTreatyAccepted} className="mt-1 text-xs text-slate-400 hover:text-slate-200">{t.game.dismiss}</button>
        </div>
      )}

      {diplomaticNotification && (
        <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-lg border border-rose-500/50 bg-slate-900/95 px-6 py-3 shadow-lg shadow-rose-900/30 text-center">
          <p className="text-sm font-semibold text-rose-200">⚠ {diplomaticNotification}</p>
          <button onClick={dismissDiplomaticNotification} className="mt-1 text-xs text-slate-400 hover:text-slate-200">{t.game.dismiss}</button>
        </div>
      )}

      {pendingPeaceTreaty && humanPlayerId === pendingPeaceTreaty.toPlayerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-sm p-6 text-center">
            <h2 className="text-xl font-bold capitalize text-white">{t.game.peaceTreatyOffer}</h2>
            <p className="mt-2 text-sm text-slate-300">
              <span className="capitalize text-cyan-300">{pendingPeaceTreaty.fromColor}</span> {t.game.offersTreaty}
            </p>
            <p className="mt-2 rounded-md border border-cyan-500/30 bg-cyan-950/30 px-3 py-2 text-xs text-cyan-100">
              {pendingPeaceTreaty.reason}
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => respondToPeaceTreaty(true)}
                className="flex-1 rounded-md border border-emerald-600/50 bg-emerald-900/30 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-900/60 transition"
              >
                {t.game.accept}
              </button>
              <button
                onClick={() => respondToPeaceTreaty(false)}
                className="flex-1 rounded-md border border-rose-600/50 bg-rose-900/30 py-2 text-sm font-medium text-rose-300 hover:bg-rose-900/60 transition"
              >
                {t.game.reject}
              </button>
            </div>
          </Card>
        </div>
      )}

      {reinforcementNotification && (
        <div className="fixed left-1/2 top-36 z-50 -translate-x-1/2 rounded-lg border border-sky-500/50 bg-slate-900/95 px-6 py-3 shadow-lg shadow-sky-900/30 text-center">
          <p className="text-sm font-semibold text-sky-200">🪖 {reinforcementNotification}</p>
          <button onClick={dismissReinforcementNotification} className="mt-1 text-xs text-slate-400 hover:text-slate-200">{t.game.dismiss}</button>
        </div>
      )}

      {multiplayerEnabled && multiplayerErrorText && (
        <div className="fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-lg border border-rose-500/50 bg-slate-900/95 px-6 py-3 shadow-lg shadow-rose-900/30 text-center">
          <p className="text-sm font-semibold text-rose-200">{multiplayerErrorText}</p>
        </div>
      )}

      {reinforcementRequest?.status === "pending" && reinforcementRequest?.toPlayerId === humanPlayerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-sm p-6 text-center">
            <h2 className="text-xl font-bold text-white">{t.game.reinforcementRequest}</h2>
            <p className="mt-2 text-sm text-slate-300">
              <span className="capitalize font-semibold text-sky-300">{reinforcementRequest.fromColor}</span> {t.game.requestingReinforcements}
            </p>
            <p className="mt-1 text-xs text-slate-400">{t.game.reinforcementNote}</p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => respondToReinforcementRequest(true)}
                className="flex-1 rounded-md border border-sky-600/50 bg-sky-900/30 py-2 text-sm font-medium text-sky-300 hover:bg-sky-900/60 transition"
              >
                {t.game.accept}
              </button>
              <button
                onClick={() => respondToReinforcementRequest(false)}
                className="flex-1 rounded-md border border-slate-600/50 bg-slate-800/30 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700/50 transition"
              >
                {t.game.decline}
              </button>
            </div>
          </Card>
        </div>
      )}

      {humanEliminated && !watching && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
          <Card className="w-full max-w-sm p-6 text-center">
            <h2 className="text-2xl font-bold text-white">{t.game.eliminated}</h2>
            <p className="mt-2 text-sm text-slate-400">{t.game.eliminatedDesc}</p>
            <div className="mt-5 flex gap-3 justify-center">
              <Button variant="secondary" onClick={() => setWatching(true)}>
                {t.game.watch}
              </Button>
              <Button
                onClick={() => {
                  resetToMenu();
                  router.push("/");
                }}
              >
                {t.game.returnToMenu}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {humanEliminated && watching && (
        <button
          onClick={() => { resetToMenu(); router.push("/"); }}
          className="fixed right-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-slate-600 bg-slate-800/90 text-slate-300 shadow-lg hover:bg-slate-700 hover:text-white transition"
          title={t.game.returnToMenu}
        >
          ✕
        </button>
      )}

      {gameOver && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
          <Card className="w-full max-w-xl p-6">
            <h2 className="text-3xl font-bold text-white">{t.game.gameOver}</h2>
            <p className="mt-2 text-sm text-slate-300">{gameOverReason ?? t.game.matchEnded} {t.game.finalRanking}</p>
            <ol className="mt-4 space-y-2">
              {ranking.map((entry, index) => (
                <li key={entry.playerId} className="flex items-center justify-between rounded-md bg-panel2 px-3 py-2">
                  <span>
                    {index + 1}. <span className="capitalize">{entry.color}</span>
                  </span>
                  <span className="text-sm text-cyan-300">{entry.tileCount} {t.game.tiles}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex justify-end">
              <Button
                onClick={() => {
                  resetToMenu();
                  router.push("/");
                }}
              >
                {t.game.returnToMenu}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
