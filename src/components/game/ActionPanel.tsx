"use client";

import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { UNIT_STATS } from "@/lib/game/unitSystem";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useGameStore } from "@/store/gameStore";
import { useTranslation } from "@/lib/i18n/LanguageContext";

export function ActionPanel() {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    currentPlayer,
    selectedTileKey,
    selectedUnit,
    toggleTechTree,
    endTurn,
    resetToMenu,
    gameOver,
    currentPlayerId,
    aiTurnInProgress,
    actionAnimationBusy,
    justBrokePeace,
    queueAnimatedUnitAction,
    healUnit
  } = useGameStore(
    useShallow((state) => ({
      currentPlayer: state.players.find((entry) => entry.id === (state.humanPlayerId ?? state.currentPlayerId)) ?? null,
      selectedTileKey: state.selectedTileKey,
      selectedUnit: state.units.find((entry) => entry.id === state.selectedUnitId) ?? null,
      toggleTechTree: state.toggleTechTree,
      endTurn: state.endTurn,
      resetToMenu: state.resetToMenu,
      gameOver: state.gameOver,
      currentPlayerId: state.currentPlayerId,
      aiTurnInProgress: state.aiTurnInProgress,
      actionAnimationBusy: state.actionAnimationBusy,
      justBrokePeace: state.justBrokePeace,
      queueAnimatedUnitAction: state.queueAnimatedUnitAction,
      healUnit: state.healUnit
    }))
  );

  if (!currentPlayer || !currentPlayerId) return null;
  // Hide the panel entirely while the AI is acting — the human has nothing to do
  if (aiTurnInProgress) return null;

  const peaceBroken = justBrokePeace.length > 0;

  const canHeal = Boolean(
    !peaceBroken &&
    !actionAnimationBusy &&
    selectedUnit &&
    !selectedUnit.hasMovedThisTurn &&
    selectedUnit.health < UNIT_STATS[selectedUnit.type].maxHealth
  );

  return (
    <Card className="p-4">
      <h3 className="text-lg font-bold text-white">{t.actionPanel.actions}</h3>
      <p className="mt-2 text-xs text-slate-400">{t.actionPanel.hint}</p>

      {selectedUnit && (
        <div className="mt-3 rounded-md border border-cyan-500/35 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
          {t.actionPanel.selectedPrefix} {UNIT_STATS[selectedUnit.type].name} | {t.actionPanel.moveRangeLabel} {UNIT_STATS[selectedUnit.type].movementRange} | {t.actionPanel.movedLabel} {selectedUnit.hasMovedThisTurn ? t.actionPanel.yes : t.actionPanel.no}
        </div>
      )}

      {peaceBroken && (
        <div className="mt-3 rounded-md border border-rose-500/40 bg-rose-900/20 px-3 py-2 text-xs text-rose-300">
          {t.actionPanel.peaceBroken}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={gameOver || actionAnimationBusy} onClick={() => toggleTechTree(true)}>{t.actionPanel.techTree}</Button>
        <Button variant="secondary" disabled={gameOver || actionAnimationBusy || peaceBroken || !selectedUnit || selectedUnit.hasMovedThisTurn || !selectedTileKey} onClick={() => {
          if (!selectedUnit || !selectedTileKey) return;
          queueAnimatedUnitAction(selectedUnit.id, selectedTileKey);
        }}>
          {t.actionPanel.moveAttack}
        </Button>
        {canHeal && (
          <Button variant="secondary" onClick={() => {
            if (!selectedUnit) return;
            healUnit(selectedUnit.id);
          }}>
            {t.actionPanel.heal}
          </Button>
        )}
        <Button disabled={gameOver || actionAnimationBusy} onClick={endTurn}>{t.actionPanel.endTurn}</Button>
        <Button
          variant="danger"
          onClick={() => {
            resetToMenu();
            router.push("/");
          }}
        >
          {t.actionPanel.finishGame}
        </Button>
      </div>

    </Card>
  );
}
