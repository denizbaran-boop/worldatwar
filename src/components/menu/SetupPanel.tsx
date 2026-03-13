"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { COLOR_HEX, PLAYER_COLORS } from "@/lib/game/constants";
import type { AIDifficulty, GameMode, MapSize, PlayerColor } from "@/lib/game/types";

type Props = {
  playerCount: number;
  aiCount: number;
  localPlayerColor: PlayerColor;
  gameMode: GameMode;
  aiDifficulty: AIDifficulty;
  mapSize: MapSize;
  onPlayerCountChange: (count: number) => void;
  onAICountChange: (count: number) => void;
  onLocalColorChange: (color: PlayerColor) => void;
  onGameModeChange: (mode: GameMode) => void;
  onAIDifficultyChange: (difficulty: AIDifficulty) => void;
  onMapSizeChange: (size: MapSize) => void;
  onBack: () => void;
  onStartMatch: () => void;
};

export function SetupPanel({
  playerCount,
  aiCount,
  localPlayerColor,
  gameMode,
  aiDifficulty,
  mapSize,
  onPlayerCountChange,
  onAICountChange,
  onLocalColorChange,
  onGameModeChange,
  onAIDifficultyChange,
  onMapSizeChange,
  onBack,
  onStartMatch
}: Props) {
  const availableColors = useMemo(() => PLAYER_COLORS, []);

  return (
    <Card className="w-full max-w-2xl border-slate-700/60 bg-slate-950/65 p-7 shadow-[0_0_60px_rgba(8,47,73,0.35)]">
      <h2 className="text-2xl font-bold text-white">Start a Game</h2>
      <p className="mt-2 text-sm text-slate-300">Configure local match settings before deployment.</p>

      <div className="mt-6 grid gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-sm text-slate-300">Game Mode</span>
          <div className="flex gap-2">
            <button
              onClick={() => onGameModeChange("pvp")}
              className={`rounded-md border px-4 py-2 text-sm transition ${
                gameMode === "pvp"
                  ? "border-cyan-500 bg-cyan-500/20 text-white"
                  : "border-slate-600 text-slate-300 hover:border-slate-400"
              }`}
            >
              Player vs Player
            </button>
            <button
              onClick={() => onGameModeChange("pvai")}
              className={`rounded-md border px-4 py-2 text-sm transition ${
                gameMode === "pvai"
                  ? "border-cyan-500 bg-cyan-500/20 text-white"
                  : "border-slate-600 text-slate-300 hover:border-slate-400"
              }`}
            >
              Player vs AI
            </button>
          </div>
        </div>

        {gameMode === "pvai" ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm text-slate-300">Number of AI Opponents</span>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((count) => {
                const active = aiCount === count;
                return (
                  <button
                    key={count}
                    onClick={() => onAICountChange(count)}
                    className={`flex flex-1 flex-col items-center gap-1.5 rounded-md border pb-2 pt-2.5 transition ${
                      active
                        ? "border-cyan-500 bg-cyan-500/10 text-white"
                        : "border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <div className={`flex flex-wrap items-center justify-center gap-0.5 ${count > 2 ? "w-[3rem]" : "w-[2.5rem]"}`}>
                      {Array.from({ length: count }).map((_, i) => (
                        <span key={i} className="text-base leading-none">🤖</span>
                      ))}
                    </div>
                    <span className="text-xs font-medium">{count} AI{count > 1 ? "s" : ""}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-sm text-slate-300">Number of Players</span>
            <div className="flex gap-2">
              {[2, 3, 4, 5].map((count) => {
                const active = playerCount === count;
                return (
                  <button
                    key={count}
                    onClick={() => onPlayerCountChange(count)}
                    className={`flex flex-1 flex-col items-center gap-1 rounded-md border py-2.5 text-sm font-medium transition ${
                      active
                        ? "border-cyan-500 bg-cyan-500/10 text-white"
                        : "border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span className="text-lg font-bold leading-none">{count}</span>
                    <span className="text-[11px]">Players</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {gameMode === "pvai" && (
          <div className="flex flex-col gap-2">
            <span className="text-sm text-slate-300">AI Difficulty</span>
            <style>{`
              @keyframes flame-flicker {
                0%,100% { box-shadow: 0 0 8px 2px rgba(251,146,60,.55), 0 0 22px 5px rgba(239,68,68,.25); }
                20%      { box-shadow: 0 0 14px 4px rgba(251,146,60,.80), 0 0 30px 8px rgba(239,68,68,.40); }
                50%      { box-shadow: 0 0 6px 1px rgba(251,146,60,.40), 0 0 16px 3px rgba(239,68,68,.15); }
                75%      { box-shadow: 0 0 18px 6px rgba(251,146,60,.90), 0 0 36px 10px rgba(239,68,68,.50); }
              }
              @keyframes flame-icon {
                0%,100% { transform: rotate(-4deg) scale(1.0); }
                33%      { transform: rotate(5deg)  scale(1.15); }
                66%      { transform: rotate(-2deg) scale(0.95); }
              }
              @keyframes leaf-breathe {
                0%,100% { box-shadow: 0 0 6px 2px rgba(34,197,94,.30); }
                50%      { box-shadow: 0 0 12px 4px rgba(34,197,94,.55); }
              }
              @keyframes bolt-pulse {
                0%,100% { box-shadow: 0 0 6px 2px rgba(234,179,8,.30); }
                50%      { box-shadow: 0 0 14px 5px rgba(234,179,8,.55); }
              }
            `}</style>
            <div className="flex gap-3">
              {([
                {
                  value: "easy" as AIDifficulty,
                  label: "Easy",
                  icon: "🌿",
                  activeClass: "border-green-500 bg-green-500/10 text-white",
                  inactiveClass: "border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200",
                  activeStyle: { animation: "leaf-breathe 2.4s ease-in-out infinite" },
                  iconStyle: {}
                },
                {
                  value: "normal" as AIDifficulty,
                  label: "Normal",
                  icon: "⚡",
                  activeClass: "border-yellow-500 bg-yellow-500/10 text-white",
                  inactiveClass: "border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200",
                  activeStyle: { animation: "bolt-pulse 1.8s ease-in-out infinite" },
                  iconStyle: {}
                },
                {
                  value: "hard" as AIDifficulty,
                  label: "Hard",
                  icon: "🔥",
                  activeClass: "border-orange-500 bg-orange-500/10 text-white",
                  inactiveClass: "border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200",
                  activeStyle: { animation: "flame-flicker .9s ease-in-out infinite" },
                  iconStyle: { display: "inline-block", animation: "flame-icon 1.1s ease-in-out infinite" }
                }
              ] as const).map(({ value, label, icon, activeClass, inactiveClass, activeStyle, iconStyle }) => {
                const active = aiDifficulty === value;
                return (
                  <button
                    key={value}
                    onClick={() => onAIDifficultyChange(value)}
                    className={`flex flex-1 flex-col items-center gap-1 rounded-md border py-3 text-sm font-medium transition-colors ${active ? activeClass : inactiveClass}`}
                    style={active ? activeStyle : {}}
                  >
                    <span className="text-xl leading-none" style={active ? iconStyle : {}}>{icon}</span>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-sm text-slate-300">Map Size</span>
          <div className="flex items-end gap-3">
            {([
              { value: "small" as MapSize, label: "Small", radius: 2, hexSize: 5 },
              { value: "medium" as MapSize, label: "Medium", radius: 3, hexSize: 5 },
              { value: "large" as MapSize, label: "Large", radius: 4, hexSize: 5 },
            ]).map(({ value, label, radius, hexSize }) => {
              const active = mapSize === value;
              const colSpacing = hexSize * 1.5;
              const rowSpacing = Math.sqrt(3) * hexSize;
              const svgW = hexSize * 2 + 2 * colSpacing * radius;
              const svgH = Math.sqrt(3) * hexSize + 2 * rowSpacing * radius;
              const centerX = svgW / 2;
              const centerY = svgH / 2;

              const hexPoints = (hx: number, hy: number) =>
                Array.from({ length: 6 }, (_, i) => {
                  const a = (Math.PI / 3) * i;
                  return `${hx + (hexSize - 0.6) * Math.cos(a)},${hy + (hexSize - 0.6) * Math.sin(a)}`;
                }).join(" ");

              const cells: { q: number; r: number; x: number; y: number }[] = [];
              for (let q = -radius; q <= radius; q++) {
                const r1 = Math.max(-radius, -q - radius);
                const r2 = Math.min(radius, -q + radius);
                for (let r = r1; r <= r2; r++) {
                  cells.push({
                    q, r,
                    x: centerX + colSpacing * q,
                    y: centerY + rowSpacing * (r + q / 2),
                  });
                }
              }

              return (
                <button
                  key={value}
                  onClick={() => onMapSizeChange(value)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 pb-2 pt-2.5 transition ${
                    active
                      ? "border-cyan-500 bg-cyan-500/10 text-white"
                      : "border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200"
                  }`}
                >
                  <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ display: "block" }}>
                    {cells.map(({ q, r, x, y }, i) => {
                      const shade = Math.abs(q * 3 + r * 5 + (q + r) * 2) % 3;
                      const fills = active
                        ? ["#164e63", "#0e7490", "#155e75"]
                        : ["#0f172a", "#1e293b", "#283548"];
                      const strokes = active ? "#0891b2" : "#334155";
                      return (
                        <polygon
                          key={i}
                          points={hexPoints(x, y)}
                          fill={fills[shade]}
                          stroke={strokes}
                          strokeWidth="0.6"
                        />
                      );
                    })}
                  </svg>
                  <span className="text-xs font-medium">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-sm text-slate-300">Your Color (Player One)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {availableColors.map((color) => {
              const active = localPlayerColor === color;
              return (
                <button
                  key={color}
                  onClick={() => onLocalColorChange(color)}
                  className={`rounded-md border px-3 py-2 text-sm capitalize transition ${
                    active ? "border-white text-white" : "border-slate-600 text-slate-300 hover:border-slate-400"
                  }`}
                  style={{ backgroundColor: active ? `${COLOR_HEX[color]}33` : "transparent" }}
                >
                  {color}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-8 flex gap-2">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <Button onClick={onStartMatch}>Start Match</Button>
      </div>
    </Card>
  );
}
