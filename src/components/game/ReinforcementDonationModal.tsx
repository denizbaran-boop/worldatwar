"use client";

import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { TECH_BY_ID } from "@/lib/game/techTree";
import { UNIT_IMAGE } from "@/lib/game/unitAssets";
import { UNIT_PROGRESSION, UNIT_STATS } from "@/lib/game/unitSystem";
import { Card } from "@/components/ui/Card";
import { useGameStore } from "@/store/gameStore";
import type { DonationEntry, UnitType } from "@/lib/game/types";

const MAX_UNITS = 5;

export function ReinforcementDonationModal() {
  const {
    players,
    currentPlayerId,
    reinforcementRequest,
    respondToReinforcementRequest,
    submitDonation
  } = useGameStore(
    useShallow((state) => ({
      players: state.players,
      currentPlayerId: state.currentPlayerId,
      reinforcementRequest: state.reinforcementRequest,
      respondToReinforcementRequest: state.respondToReinforcementRequest,
      submitDonation: state.submitDonation
    }))
  );

  const [quantities, setQuantities] = useState<Partial<Record<UnitType, number>>>({});

  const isDonating = reinforcementRequest?.status === "donating" && reinforcementRequest?.toPlayerId === currentPlayerId;
  if (!isDonating || !currentPlayerId) return null;

  const donor = players.find((p) => p.id === currentPlayerId);
  if (!donor) return null;

  const totalUnits = Object.values(quantities).reduce((sum, q) => sum + (q ?? 0), 0);
  const totalCost = UNIT_PROGRESSION.reduce((sum, type) => {
    return sum + (quantities[type] ?? 0) * UNIT_STATS[type].productionCost;
  }, 0);

  const isUnlocked = (type: UnitType): boolean => {
    if (type === "basic_soldier") return true;
    return donor.unlockedTechIds.some((id) => TECH_BY_ID[id]?.unlockedUnitType === type);
  };

  const adjust = (type: UnitType, delta: number) => {
    const current = quantities[type] ?? 0;
    const next = Math.max(0, current + delta);
    const newTotal = totalUnits - current + next;
    if (newTotal > MAX_UNITS) return;
    const costDelta = delta * UNIT_STATS[type].productionCost;
    if (delta > 0 && totalCost + costDelta > donor.gold) return;
    setQuantities((prev) => ({ ...prev, [type]: next }));
  };

  const handleSend = () => {
    const entries: DonationEntry[] = UNIT_PROGRESSION
      .filter((type) => (quantities[type] ?? 0) > 0)
      .map((type) => ({ unitType: type, quantity: quantities[type]! }));
    if (entries.length === 0) return;
    submitDonation(entries);
    setQuantities({});
  };

  const handleCancel = () => {
    setQuantities({});
    respondToReinforcementRequest(false);
  };

  const donatableTypes = UNIT_PROGRESSION.filter(isUnlocked);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-md p-6">
        <h2 className="text-xl font-bold text-white">Send Reinforcements</h2>
        <p className="mt-1 text-sm text-slate-300">
          Sending to <span className="capitalize font-semibold text-sky-300">{reinforcementRequest!.fromColor}</span>.
          You pay the gold cost.
        </p>

        <div className="mt-4 space-y-2 max-h-72 overflow-y-auto pr-1">
          {donatableTypes.map((type) => {
            const stats = UNIT_STATS[type];
            const qty = quantities[type] ?? 0;
            const canAdd = totalUnits < MAX_UNITS && totalCost + stats.productionCost <= donor.gold;
            return (
              <div key={type} className="flex items-center gap-3 rounded-md border border-border bg-panel2 px-3 py-2">
                <div className="relative h-8 w-8 flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={UNIT_IMAGE[type]} alt={stats.name} className="h-full w-full object-contain" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{stats.name}</div>
                  <div className="text-xs text-amber-300">{stats.productionCost}g each</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjust(type, -1)}
                    disabled={qty === 0}
                    className="h-6 w-6 rounded border border-slate-600 bg-slate-800 text-sm text-white disabled:opacity-30 hover:bg-slate-700 transition"
                  >
                    −
                  </button>
                  <span className="w-4 text-center text-sm font-bold text-white">{qty}</span>
                  <button
                    onClick={() => adjust(type, 1)}
                    disabled={!canAdd}
                    className="h-6 w-6 rounded border border-slate-600 bg-slate-800 text-sm text-white disabled:opacity-30 hover:bg-slate-700 transition"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm">
          <span className="text-slate-300">
            Units: <span className={totalUnits === MAX_UNITS ? "text-rose-400 font-bold" : "text-white font-bold"}>{totalUnits}/{MAX_UNITS}</span>
          </span>
          <span className="text-amber-300">
            Cost: <span className="font-bold">{totalCost}g</span>
            <span className="ml-2 text-slate-400">(have {donor.gold}g)</span>
          </span>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            onClick={handleSend}
            disabled={totalUnits === 0}
            className="flex-1 rounded-md border border-sky-600/50 bg-sky-900/30 py-2 text-sm font-medium text-sky-300 hover:bg-sky-900/60 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send ({totalUnits} unit{totalUnits !== 1 ? "s" : ""})
          </button>
          <button
            onClick={handleCancel}
            className="flex-1 rounded-md border border-slate-600/50 bg-slate-800/30 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700/50 transition"
          >
            Cancel
          </button>
        </div>
      </Card>
    </div>
  );
}
