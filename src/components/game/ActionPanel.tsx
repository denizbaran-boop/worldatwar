"use client";

import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { UNIT_STATS } from "@/lib/game/unitSystem";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useGameStore } from "@/store/gameStore";

export function ActionPanel() {
  const router = useRouter();
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
      <h3 className="text-lg font-bold text-white">Actions</h3>
      <p className="mt-2 text-xs text-slate-400">Exploration now happens only by unit movement. Select a unit, then click a destination tile.</p>

      {selectedUnit && (
        <div className="mt-3 rounded-md border border-cyan-500/35 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
          Selected: {UNIT_STATS[selectedUnit.type].name} | Move range: {UNIT_STATS[selectedUnit.type].movementRange} | Moved: {selectedUnit.hasMovedThisTurn ? "Yes" : "No"}
        </div>
      )}

      {peaceBroken && (
        <div className="mt-3 rounded-md border border-rose-500/40 bg-rose-900/20 px-3 py-2 text-xs text-rose-300">
          Peace broken — no further actions this turn. End your turn to continue.
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={gameOver || actionAnimationBusy} onClick={() => toggleTechTree(true)}>Tech Tree</Button>
        <Button variant="secondary" disabled={gameOver || actionAnimationBusy || peaceBroken || !selectedUnit || selectedUnit.hasMovedThisTurn || !selectedTileKey} onClick={() => {
          if (!selectedUnit || !selectedTileKey) return;
          queueAnimatedUnitAction(selectedUnit.id, selectedTileKey);
        }}>
          Move / Attack To Selected Tile
        </Button>
        {canHeal && (
          <Button variant="secondary" onClick={() => {
            if (!selectedUnit) return;
            healUnit(selectedUnit.id);
          }}>
            Heal +1 HP
          </Button>
        )}
        <Button disabled={gameOver || actionAnimationBusy} onClick={endTurn}>End Turn</Button>
        <Button
          variant="danger"
          onClick={() => {
            resetToMenu();
            router.push("/");
          }}
        >
          Finish Game
        </Button>
      </div>

    </Card>
  );
}
