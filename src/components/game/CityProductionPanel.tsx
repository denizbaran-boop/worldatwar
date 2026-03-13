"use client";

import Image from "next/image";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { TECH_BY_ID } from "@/lib/game/techTree";
import { UNIT_IMAGE } from "@/lib/game/unitAssets";
import { UNIT_PROGRESSION, UNIT_STATS } from "@/lib/game/unitSystem";
import { findTileByKey, isTileOccupied } from "@/lib/game/actions";
import { useGameStore } from "@/store/gameStore";
import { useTranslation } from "@/lib/i18n/LanguageContext";

export function CityProductionPanel() {
  const {
    currentPlayer,
    selectedTileKey,
    humanPlayerId,
    currentPlayerId,
    aiTurnInProgress,
    actionAnimationBusy,
    produceUnit,
    gameOver,
    tiles,
    units,
    selectTile,
    selectUnit
  } = useGameStore(
    useShallow((state) => ({
      currentPlayer: state.players.find((p) => p.id === (state.humanPlayerId ?? state.currentPlayerId)) ?? null,
      selectedTileKey: state.selectedTileKey,
      humanPlayerId: state.humanPlayerId,
      currentPlayerId: state.currentPlayerId,
      aiTurnInProgress: state.aiTurnInProgress,
      actionAnimationBusy: state.actionAnimationBusy,
      produceUnit: state.produceUnit,
      gameOver: state.gameOver,
      tiles: state.tiles,
      units: state.units,
      selectTile: state.selectTile,
      selectUnit: state.selectUnit
    }))
  );

  // The faction the human controls
  const humanFactionId = humanPlayerId ?? currentPlayerId;

  const selectedTile = selectedTileKey ? findTileByKey(tiles, selectedTileKey) : null;

  // Only show the panel for the human's own cities, and never during the AI's turn
  const isCityTile =
    selectedTile !== null &&
    selectedTile.ownerId === humanFactionId &&
    (selectedTile.isCapital || selectedTile.villageId !== null);

  const tileOccupied = selectedTileKey ? isTileOccupied(units, selectedTileKey) : false;

  const unlockedTypes = useMemo(() => {
    if (!currentPlayer) return ["basic_soldier"];
    return UNIT_PROGRESSION.filter((unitType) => {
      if (unitType === "basic_soldier") return true;
      return currentPlayer.unlockedTechIds.some(
        (techId) => TECH_BY_ID[techId]?.unlockedUnitType === unitType
      );
    });
  }, [currentPlayer]);

  const { t } = useTranslation();
  const visible = isCityTile && !gameOver && currentPlayer && !aiTurnInProgress;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-30 transition-transform duration-300 ease-out"
      style={{ transform: visible ? "translateY(0)" : "translateY(110%)" }}
    >
      <div className="mx-auto max-w-[1500px] px-4 pb-4">
        <div className="rounded-xl border border-slate-700/60 bg-slate-950/92 shadow-[0_-4px_32px_rgba(0,0,0,0.55)] backdrop-blur-md">
          {/* header */}
          <div className="flex items-center justify-between border-b border-slate-800/70 px-5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                {selectedTile?.isCapital ? t.cityProduction.capital : t.cityProduction.city}{t.cityProduction.production}
              </span>
              {tileOccupied && (
                <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                  {t.cityProduction.tileOccupied}
                </span>
              )}
            </div>
            <button
              onClick={() => { selectTile(null); selectUnit(null); }}
              className="rounded-full p-1 text-slate-500 transition hover:text-slate-300"
              aria-label="Close"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* unit cards */}
          <div className="flex gap-3 overflow-x-auto px-5 py-4 scrollbar-none">
            {UNIT_PROGRESSION.map((unitType) => {
              const stats = UNIT_STATS[unitType];
              const isUnlocked = unlockedTypes.includes(unitType);
              const canAfford = (currentPlayer?.gold ?? 0) >= stats.productionCost;
              const canProduce = isUnlocked && canAfford && !tileOccupied && !actionAnimationBusy;

              return (
                <button
                  key={unitType}
                  disabled={!canProduce}
                  onClick={() => {
                    if (!selectedTileKey) return;
                    produceUnit(unitType, selectedTileKey);
                  }}
                  className={`group relative flex w-[82px] shrink-0 flex-col items-center gap-1.5 rounded-xl border py-3 transition-all duration-150 ${
                    !isUnlocked
                      ? "cursor-not-allowed border-slate-800/60 bg-slate-900/50 opacity-40"
                      : !canAfford || tileOccupied
                        ? "cursor-not-allowed border-slate-700/50 bg-slate-900/60 opacity-55"
                        : "cursor-pointer border-slate-600/60 bg-slate-800/70 hover:border-cyan-500/60 hover:bg-slate-700/70 active:scale-95"
                  }`}
                >
                  {/* unit image */}
                  <div className="relative h-11 w-11 overflow-hidden rounded-lg">
                    <Image
                      src={UNIT_IMAGE[unitType]}
                      alt={stats.name}
                      fill
                      sizes="44px"
                      className={`object-cover ${!isUnlocked ? "grayscale" : ""}`}
                      draggable={false}
                    />
                  </div>

                  {/* name */}
                  <span className="text-center text-[10px] font-semibold leading-tight text-slate-200" style={{ maxWidth: 68 }}>
                    {stats.name}
                  </span>

                  {/* cost badge */}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    !isUnlocked
                      ? "bg-slate-800 text-slate-500"
                      : canAfford
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-red-500/15 text-red-400"
                  }`}>
                    {!isUnlocked ? t.cityProduction.locked : `${stats.productionCost}g`}
                  </span>

                  {/* stats row */}
                  {isUnlocked && (
                    <div className="flex gap-1.5 text-[9px] text-slate-400">
                      <span className="text-red-300">⚔{stats.damage}</span>
                      <span className="text-emerald-300">♥{stats.maxHealth}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
