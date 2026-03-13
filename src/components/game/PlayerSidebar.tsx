"use client";

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { COLOR_HEX, GOLD_MINE_TURN_GOLD, VILLAGE_TURN_GOLD } from "@/lib/game/constants";
import { getDiplomacyPairKey } from "@/lib/game/diplomacy";
import { Card } from "@/components/ui/Card";
import { useGameStore } from "@/store/gameStore";
import { useTranslation } from "@/lib/i18n/LanguageContext";

export function PlayerSidebar() {
  const { t } = useTranslation();
  const {
    players,
    currentPlayerId,
    humanPlayerId,
    aiPlayerIds,
    tiles,
    villages,
    units,
    contactedPlayerIds,
    factionContactPairs,
    peaceTreaties,
    lastCombatTurnByPair,
    turnNumber,
    sendPeaceTreaty,
    breakPeaceTreaty,
    outgoingTreaty,
    peaceMemories,
    reinforcementRequest,
    sendReinforcementRequest
  } = useGameStore(
    useShallow((state) => ({
      players: state.players,
      currentPlayerId: state.currentPlayerId,
      humanPlayerId: state.humanPlayerId,
      aiPlayerIds: state.aiPlayerIds,
      tiles: state.tiles,
      villages: state.villages,
      units: state.units,
      contactedPlayerIds: state.contactedPlayerIds,
      factionContactPairs: state.factionContactPairs,
      peaceTreaties: state.peaceTreaties,
      lastCombatTurnByPair: state.lastCombatTurnByPair,
      turnNumber: state.turnNumber,
      sendPeaceTreaty: state.sendPeaceTreaty,
      breakPeaceTreaty: state.breakPeaceTreaty,
      outgoingTreaty: state.outgoingTreaty,
      peaceMemories: state.peaceMemories,
      reinforcementRequest: state.reinforcementRequest,
      sendReinforcementRequest: state.sendReinforcementRequest
    }))
  );

  const unitCountByPlayer = useMemo(() => {
    const result = new Map<string, number>();
    for (const unit of units) {
      result.set(unit.ownerId, (result.get(unit.ownerId) ?? 0) + 1);
    }
    return result;
  }, [units]);

  const diplomacyRows = useMemo(() => {
    const alivePlayers = players.filter((player) => player.isAlive);
    const rows: Array<{ key: string; left: string; right: string; icon: string; label: string; tone: string }> = [];

    for (let i = 0; i < alivePlayers.length; i += 1) {
      for (let j = i + 1; j < alivePlayers.length; j += 1) {
        const left = alivePlayers[i];
        const right = alivePlayers[j];
        const pairKey = [left.id, right.id].sort().join(":");
        // Only show pairs where both factions have had first contact
        if (!factionContactPairs.includes(pairKey)) continue;
        const isPeace = peaceTreaties.some(
          (entry) =>
            (entry.playerA === left.id && entry.playerB === right.id) ||
            (entry.playerA === right.id && entry.playerB === left.id)
        );
        const lastCombatTurn = lastCombatTurnByPair[pairKey];
        const atWar = !isPeace && typeof lastCombatTurn === "number" && turnNumber - lastCombatTurn < 3;

        rows.push({
          key: pairKey,
          left: left.color,
          right: right.color,
          icon: isPeace ? "☮" : atWar ? "⚔" : "○",
          label: isPeace ? t.sidebar.statusPeace : atWar ? t.sidebar.statusWar : t.sidebar.statusNeutral,
          tone: isPeace ? "text-emerald-300" : atWar ? "text-rose-300" : "text-slate-300"
        });
      }
    }

    return rows;
  }, [factionContactPairs, lastCombatTurnByPair, peaceTreaties, players, turnNumber]);

  return (
    <Card className="p-4">
      <h3 className="text-lg font-bold text-white">{t.sidebar.players}</h3>
      <div className="mt-3 space-y-2">
        {players.map((player) => {
          const isSelf = player.id === humanPlayerId;
          const isVisible = humanPlayerId === null || isSelf || contactedPlayerIds.includes(player.id);

          const isAtPeace = humanPlayerId !== null && peaceTreaties.some(
            (treaty) => (treaty.playerA === humanPlayerId && treaty.playerB === player.id) ||
                   (treaty.playerA === player.id && treaty.playerB === humanPlayerId)
          );

          const awaitingResponse = outgoingTreaty?.toPlayerId === player.id;
          const peaceMemory = humanPlayerId ? peaceMemories[getDiplomacyPairKey(humanPlayerId, player.id)] : null;
          const peaceOnCooldown = Boolean(
            peaceMemory && (
              (peaceMemory.lastOfferTurn !== null && turnNumber - peaceMemory.lastOfferTurn < 4) ||
              (peaceMemory.lastRejectedTurn !== null && turnNumber - peaceMemory.lastRejectedTurn < 6) ||
              (peaceMemory.lastBrokenTurn !== null && turnNumber - peaceMemory.lastBrokenTurn < 10)
            )
          );

          const canSendTreaty = !isSelf &&
            isVisible &&
            player.isAlive &&
            !isAtPeace &&
            !outgoingTreaty &&  // one at a time
            !peaceOnCooldown &&
            humanPlayerId !== null &&
            currentPlayerId === humanPlayerId;

          const canBreakPeace = isAtPeace &&
            humanPlayerId !== null &&
            currentPlayerId === humanPlayerId;

          const awaitingReinforcements = reinforcementRequest?.fromPlayerId === humanPlayerId &&
            reinforcementRequest?.toPlayerId === player.id;
          const canCallReinforcements = isAtPeace &&
            !isSelf &&
            isVisible &&
            player.isAlive &&
            !reinforcementRequest &&
            humanPlayerId !== null &&
            currentPlayerId === humanPlayerId;

          if (!isVisible) {
            return (
              <div key={player.id} className="rounded-md border border-border bg-panel2 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-600" />
                  <span className="text-slate-400">{t.sidebar.unknown}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{t.sidebar.unknownFaction}</div>
              </div>
            );
          }

          const tileCount = tiles.filter((tile) => tile.ownerId === player.id).length;
          const unitCount = unitCountByPlayer.get(player.id) ?? 0;
          const villageCount = villages.filter((village) => village.ownerId === player.id).length;
          const mineCount = tiles.filter((tile) => tile.ownerId === player.id && tile.hasGoldMine).length;
          const income = villageCount * VILLAGE_TURN_GOLD + mineCount * GOLD_MINE_TURN_GOLD;

          return (
            <div key={player.id} className={`rounded-md border px-3 py-2 transition ${player.id === currentPlayerId ? "border-cyan-400 bg-cyan-900/20" : "border-border bg-panel2"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLOR_HEX[player.color], boxShadow: `0 0 8px ${COLOR_HEX[player.color]}` }} />
                  <span className="capitalize">{player.color}</span>
                  {aiPlayerIds.includes(player.id) && <span className="text-[10px] uppercase tracking-wide text-cyan-300">{t.sidebar.ai}</span>}
                  {!player.isAlive && <span className="text-[10px] uppercase tracking-wide text-rose-400">{t.sidebar.eliminated}</span>}
                  {isAtPeace && <span className="text-[10px] uppercase tracking-wide text-emerald-300">{t.sidebar.peace}</span>}
                </div>
              </div>
              <div className="mt-1 text-xs text-slate-300">{t.sidebar.tiles} {tileCount}</div>
              <div className="text-xs text-slate-300">{t.sidebar.units} {unitCount}</div>
              <div className="text-xs text-slate-300">{t.sidebar.cities} {villageCount}</div>
              <div className="text-xs text-slate-300">{t.sidebar.mines} {mineCount}</div>
              <div className="text-xs text-amber-300">{t.sidebar.gold} {player.gold}</div>
              <div className="text-xs text-emerald-300">{t.sidebar.income}{income}{t.sidebar.incomeSuffix}</div>
              {awaitingResponse && (
                <div className="mt-2 w-full rounded border border-yellow-600/40 bg-yellow-900/15 px-2 py-1 text-center text-[11px] text-yellow-300/80">
                  {t.sidebar.awaitingResponse}
                </div>
              )}
              {!awaitingResponse && peaceOnCooldown && !isAtPeace && (
                <div className="mt-2 w-full rounded border border-slate-700/50 bg-slate-900/30 px-2 py-1 text-center text-[11px] text-slate-400">
                  {t.sidebar.diplomacyCooldown}
                </div>
              )}
              {canSendTreaty && (
                <button
                  onClick={() => sendPeaceTreaty(player.id)}
                  className="mt-2 w-full rounded border border-emerald-600/50 bg-emerald-900/20 px-2 py-1 text-[11px] text-emerald-300 transition hover:bg-emerald-900/40"
                >
                  {t.sidebar.sendPeaceTreaty}
                </button>
              )}
              {canBreakPeace && (
                <button
                  onClick={() => breakPeaceTreaty(player.id)}
                  className="mt-2 w-full rounded border border-rose-600/50 bg-rose-900/20 px-2 py-1 text-[11px] text-rose-300 transition hover:bg-rose-900/40"
                >
                  {t.sidebar.breakPeaceTreaty}
                </button>
              )}
              {awaitingReinforcements && (
                <div className="mt-2 w-full rounded border border-sky-600/40 bg-sky-900/15 px-2 py-1 text-center text-[11px] text-sky-300/80">
                  {t.sidebar.awaitingReinforcements}
                </div>
              )}
              {canCallReinforcements && (
                <button
                  onClick={() => sendReinforcementRequest(player.id)}
                  className="mt-2 w-full rounded border border-sky-600/50 bg-sky-900/20 px-2 py-1 text-[11px] text-sky-300 transition hover:bg-sky-900/40"
                >
                  {t.sidebar.callReinforcements}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 border-t border-border/60 pt-4">
        <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">{t.sidebar.diplomacyStatus}</h4>
        <div className="mt-3 space-y-2">
          {diplomacyRows.length > 0 ? diplomacyRows.map((row) => (
            <div key={row.key} className="flex items-center justify-between rounded-md border border-border bg-panel2 px-3 py-2 text-sm">
              <span className="capitalize text-slate-200">{row.left}</span>
              <span className={`px-2 text-base ${row.tone}`} title={row.label}>{row.icon}</span>
              <span className="capitalize text-slate-200">{row.right}</span>
            </div>
          )) : (
            <div className="rounded-md border border-border bg-panel2 px-3 py-2 text-xs text-slate-400">
              {t.sidebar.noRelationships}
            </div>
          )}
        </div>

      </div>
    </Card>
  );
}
