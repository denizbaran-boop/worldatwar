"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { UNIT_IMAGE } from "@/lib/game/unitAssets";
import { TECH_TREE_NODES, isTechAvailable } from "@/lib/game/techTree";
import { UNIT_STATS } from "@/lib/game/unitSystem";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useGameStore } from "@/store/gameStore";
import { useTranslation } from "@/lib/i18n/LanguageContext";

// Canvas dimensions and layout
const GRAPH_WIDTH = 1600;
const GRAPH_HEIGHT = 900;
const GRAPH_ORIGIN_X = 560;   // x pixel of the center node (military_basics)
const GRAPH_ORIGIN_Y = 600;   // y pixel of the center node
const HEX_X_STEP = 210;
const HEX_Y_STEP = 210;
const NODE_WIDTH = 200;
const NODE_HEIGHT = 224;

// Branch colors (for connector lines and labels)
const BRANCH_COLOR: Record<string, string> = {
  ground:  "#38bdf8",   // sky blue
  defense: "#f59e0b",   // amber
  air:     "#a78bfa",   // violet
  center:  "#e2e8f0"    // white
};

function getBranch(gridX: number, gridY: number): string {
  if (gridX === 0 && gridY === 0) return "center";
  if (gridX > 0) return "ground";
  if (gridX < 0) return "defense";
  return "air"; // gridX === 0 && gridY < 0
}

const HEX_CLIP_PATH = "polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0 50%)";

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.0;
const DEFAULT_ZOOM = 0.82;

export function TechTreeModal() {
  const graphScrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({ active: false, startX: 0, startY: 0, startScrollLeft: 0, startScrollTop: 0 });
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [treeZoom, setTreeZoom] = useState(DEFAULT_ZOOM);

  const { t } = useTranslation();
  const { open, toggleTechTree, player, unlockTech, gameOver, actionAnimationBusy } = useGameStore(
    useShallow((state) => ({
      open: state.techTreeOpen,
      toggleTechTree: state.toggleTechTree,
      player: state.players.find((entry) => entry.id === state.currentPlayerId) ?? null,
      unlockTech: state.unlockTech,
      gameOver: state.gameOver,
      actionAnimationBusy: state.actionAnimationBusy
    }))
  );

  const nodes = useMemo(() => {
    if (!player) return [];
    return TECH_TREE_NODES.map((node) => {
      const unlocked = player.unlockedTechIds.includes(node.id);
      const available = isTechAvailable(player.unlockedTechIds, node.id);
      const affordable = player.gold >= node.cost;
      return {
        ...node,
        unlocked,
        available,
        affordable,
        branch: getBranch(node.gridX, node.gridY),
        unitName: node.unlockedUnitType ? UNIT_STATS[node.unlockedUnitType].name : node.name,
        image: node.unlockedUnitType ? UNIT_IMAGE[node.unlockedUnitType] : null,
        damage: node.unlockedUnitType ? UNIT_STATS[node.unlockedUnitType].damage : null,
        maxHealth: node.unlockedUnitType ? UNIT_STATS[node.unlockedUnitType].maxHealth : null,
        x: GRAPH_ORIGIN_X + node.gridX * HEX_X_STEP,
        y: GRAPH_ORIGIN_Y + node.gridY * HEX_Y_STEP
      };
    });
  }, [player]);

  // Center on basic soldier when opening
  useEffect(() => {
    if (!open || !graphScrollRef.current) return;
    const el = graphScrollRef.current;
    el.scrollLeft = Math.max(0, GRAPH_ORIGIN_X * DEFAULT_ZOOM - el.clientWidth / 2);
    el.scrollTop = Math.max(0, GRAPH_ORIGIN_Y * DEFAULT_ZOOM - el.clientHeight / 2);
  }, [open]);

  // Apply pending scroll after zoom state update
  useEffect(() => {
    if (!pendingScrollRef.current || !graphScrollRef.current) return;
    graphScrollRef.current.scrollLeft = pendingScrollRef.current.left;
    graphScrollRef.current.scrollTop = pendingScrollRef.current.top;
    pendingScrollRef.current = null;
  }, [treeZoom]);

  // Drag-to-pan
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag.active || !graphScrollRef.current) return;
      graphScrollRef.current.scrollLeft = drag.startScrollLeft - (e.clientX - drag.startX);
      graphScrollRef.current.scrollTop = drag.startScrollTop - (e.clientY - drag.startY);
    };
    const onUp = () => { dragRef.current.active = false; setIsDragging(false); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [isDragging]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!graphScrollRef.current) return;
    const el = graphScrollRef.current;
    const rect = el.getBoundingClientRect();
    const cursorVX = e.clientX - rect.left;
    const cursorVY = e.clientY - rect.top;
    const worldX = (el.scrollLeft + cursorVX) / treeZoom;
    const worldY = (el.scrollTop + cursorVY) / treeZoom;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, treeZoom * factor));
    if (nextZoom === treeZoom) return;
    pendingScrollRef.current = { left: worldX * nextZoom - cursorVX, top: worldY * nextZoom - cursorVY };
    setTreeZoom(nextZoom);
  };

  if (!open || !player) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <Card className="flex h-[min(92vh,980px)] w-full max-w-6xl flex-col overflow-hidden border-slate-700 bg-[#04070e] p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-slate-800 bg-[#04070e]/95 px-6 py-4 backdrop-blur">
          <div className="flex items-center gap-4">
            <h3 className="text-xl font-bold text-white">{t.techTree.title}</h3>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5"><span className="h-2 w-5 rounded-full" style={{background: BRANCH_COLOR.ground}} /> {t.techTree.ground}</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-5 rounded-full" style={{background: BRANCH_COLOR.air}} /> {t.techTree.air}</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-5 rounded-full" style={{background: BRANCH_COLOR.defense}} /> {t.techTree.defense}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{Math.round(treeZoom * 100)}%</span>
            <span className="rounded-md border border-amber-400/45 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-200">{t.techTree.goldLabel} {player.gold}</span>
            <Button variant="secondary" onClick={() => toggleTechTree(false)}>{t.techTree.close}</Button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* Graph panel */}
          <div className="flex min-h-0 flex-col rounded-xl border border-slate-800 bg-[radial-gradient(circle_at_center,#0f172a_0%,#020617_65%)] p-3">
            <p className="mb-2 text-xs text-slate-400">{t.techTree.hint}</p>
            <div
              ref={graphScrollRef}
              className={`min-h-0 flex-1 overflow-auto rounded-lg border border-slate-700/70 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
              onMouseDown={(e) => {
                if (e.button !== 0 || !graphScrollRef.current) return;
                dragRef.current = { active: true, startX: e.clientX, startY: e.clientY,
                  startScrollLeft: graphScrollRef.current.scrollLeft,
                  startScrollTop: graphScrollRef.current.scrollTop };
                setIsDragging(true);
              }}
              onWheel={handleWheel}
            >
              {/* Size adapter — makes the scrollable area match the scaled content */}
              <div style={{ width: GRAPH_WIDTH * treeZoom, height: GRAPH_HEIGHT * treeZoom, position: "relative", flexShrink: 0 }}>
                {/* Scaled graph content */}
                <div
                  style={{
                    width: GRAPH_WIDTH,
                    height: GRAPH_HEIGHT,
                    transform: `scale(${treeZoom})`,
                    transformOrigin: "0 0",
                    position: "absolute",
                    backgroundImage: "radial-gradient(#cbd5e1 0.5px, transparent 0.6px)",
                    backgroundSize: "60px 60px"
                  }}
                >
                  {/* SVG layer: branch lines + labels */}
                  <svg viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }}>
                    {/* Branch axis guides */}
                    {/* Ground axis */}
                    <line x1={GRAPH_ORIGIN_X} y1={GRAPH_ORIGIN_Y} x2={GRAPH_WIDTH - 60} y2={GRAPH_ORIGIN_Y}
                      stroke={BRANCH_COLOR.ground} strokeOpacity="0.08" strokeWidth="80" />
                    {/* Defense axis */}
                    <line x1={GRAPH_ORIGIN_X} y1={GRAPH_ORIGIN_Y} x2={60} y2={GRAPH_ORIGIN_Y}
                      stroke={BRANCH_COLOR.defense} strokeOpacity="0.08" strokeWidth="80" />
                    {/* Air axis */}
                    <line x1={GRAPH_ORIGIN_X} y1={GRAPH_ORIGIN_Y} x2={GRAPH_ORIGIN_X} y2={60}
                      stroke={BRANCH_COLOR.air} strokeOpacity="0.08" strokeWidth="80" />

                    {/* Branch labels */}
                    <text x={GRAPH_WIDTH - 80} y={GRAPH_ORIGIN_Y - 24}
                      textAnchor="end" fontSize="11" fontWeight="700" letterSpacing="0.3em"
                      fill={BRANCH_COLOR.ground} opacity="0.55" style={{ textTransform: "uppercase" }}>GROUND</text>
                    <text x={80} y={GRAPH_ORIGIN_Y - 24}
                      textAnchor="start" fontSize="11" fontWeight="700" letterSpacing="0.3em"
                      fill={BRANCH_COLOR.defense} opacity="0.55">DEFENSE</text>
                    <text x={GRAPH_ORIGIN_X} y={80}
                      textAnchor="middle" fontSize="11" fontWeight="700" letterSpacing="0.3em"
                      fill={BRANCH_COLOR.air} opacity="0.55">AIR</text>

                    {/* Connector lines between nodes */}
                    {nodes.map((node) =>
                      node.prerequisites.map((prereqId) => {
                        const source = nodes.find((e) => e.id === prereqId);
                        if (!source) return null;
                        const lineActive = source.unlocked && (node.unlocked || node.available);
                        const color = BRANCH_COLOR[node.branch] ?? "#e2e8f0";
                        return (
                          <line
                            key={`${prereqId}-${node.id}`}
                            x1={source.x} y1={source.y}
                            x2={node.x} y2={node.y}
                            stroke={lineActive ? color : "#334155"}
                            strokeOpacity={lineActive ? "0.9" : "0.4"}
                            strokeWidth="4"
                            strokeLinecap="round"
                          />
                        );
                      })
                    )}
                  </svg>

                  {/* Hex nodes */}
                  {nodes.map((node, index) => {
                    const branchColor = BRANCH_COLOR[node.branch] ?? "#e2e8f0";

                    const shellClass = node.unlocked
                      ? "from-emerald-300 via-emerald-500 to-emerald-800"
                      : node.available
                        ? node.affordable
                          ? "from-sky-200 via-sky-500 to-sky-800"
                          : "from-amber-200 via-amber-500 to-amber-800"
                        : "from-slate-500 via-slate-700 to-slate-900";

                    const badgeClass = node.unlocked
                      ? "border-emerald-300/80 bg-emerald-500/20 text-emerald-100"
                      : node.available
                        ? node.affordable
                          ? "border-cyan-300/80 bg-cyan-400/20 text-cyan-50"
                          : "border-amber-300/80 bg-amber-400/20 text-amber-50"
                        : "border-slate-500/80 bg-slate-800/70 text-slate-200";

                    return (
                      <button
                        key={node.id}
                        type="button"
                        className={`absolute text-left transition duration-200 ${node.available && !gameOver && !node.unlocked && node.affordable ? "hover:-translate-y-1" : ""}`}
                        style={{
                          left: node.x - NODE_WIDTH / 2,
                          top: node.y - NODE_HEIGHT / 2,
                          width: NODE_WIDTH,
                          height: NODE_HEIGHT,
                          opacity: 0,
                          animation: "fadeNode 320ms ease forwards",
                          animationDelay: `${index * 55}ms`
                        }}
                        onClick={() => {
                          if (gameOver || actionAnimationBusy || node.unlocked || !node.available || !node.affordable) return;
                          unlockTech(node.id);
                        }}
                      >
                        {/* Branch accent ring on center and branch-entry nodes */}
                        {(node.branch !== "center") && (
                          <div className="absolute inset-0 rounded-full opacity-20"
                            style={{ clipPath: HEX_CLIP_PATH, boxShadow: `inset 0 0 0 3px ${branchColor}` }} />
                        )}
                        <div
                          className={`absolute inset-0 bg-gradient-to-br ${shellClass}`}
                          style={{
                            clipPath: HEX_CLIP_PATH,
                            filter: node.unlocked
                              ? `drop-shadow(0 0 18px ${branchColor}44)`
                              : "drop-shadow(0 14px 20px rgba(15,23,42,0.35))"
                          }}
                        />
                        <div
                          className="absolute inset-[5px] overflow-hidden"
                          style={{ clipPath: HEX_CLIP_PATH, background: "linear-gradient(180deg, rgba(2,6,23,0.1), rgba(2,6,23,0.82))" }}
                        >
                          {node.image && (
                            <Image
                              src={node.image}
                              alt={node.unitName}
                              fill
                              sizes="200px"
                              className={`absolute inset-0 h-full w-full object-cover ${node.unlocked ? "" : node.available ? "opacity-90" : "opacity-45 grayscale"}`}
                              draggable={false}
                            />
                          )}
                          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.05),rgba(2,6,23,0.2)_30%,rgba(2,6,23,0.88)_100%)]" />
                          {/* Status badge */}
                          <div className="absolute inset-x-0 top-[18%] flex justify-center">
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] ${badgeClass}`}>
                              {node.unlocked ? t.techTree.unlocked : node.available ? (node.affordable ? t.techTree.ready : t.techTree.needGold) : t.techTree.locked}
                            </span>
                          </div>
                          {/* Cost */}
                          {node.cost > 0 && (
                            <div className="absolute inset-x-0 top-[30%] flex justify-center">
                              <div className="rounded-full border border-white/25 bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white">
                                {node.cost}g
                              </div>
                            </div>
                          )}
                          {/* Name + stats */}
                          <div className="absolute inset-x-[14%] bottom-[10%] text-center">
                            <div className="text-[13px] font-black leading-tight text-white" style={{ wordBreak: "break-word" }}>
                              {node.name}
                            </div>
                            {node.damage !== null && node.maxHealth !== null && (
                              <div className="mt-1 flex justify-center gap-2">
                                <span className="text-[10px] font-semibold text-red-300">⚔ {node.damage}</span>
                                <span className="text-[10px] font-semibold text-emerald-300">♥ {node.maxHealth}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Side panel */}
          <div className="min-h-0 overflow-auto rounded-xl border border-slate-800 bg-[#020617]/80 p-3">
            <div className="mb-3 rounded-lg border border-slate-700/70 bg-slate-900/60 p-3 text-xs text-slate-300">
              {t.techTree.branchInfo}
            </div>
            {(["ground", "air", "defense"] as const).map((branch) => {
              const branchNodes = nodes.filter((n) => n.branch === branch || (branch === "ground" && n.branch === "center"));
              const color = BRANCH_COLOR[branch];
              const label = branch === "ground" ? t.techTree.ground : branch === "air" ? t.techTree.air : t.techTree.defense;
              return (
                <div key={branch} className="mb-4">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="h-1.5 w-3 rounded-full" style={{ background: color }} />
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>{label}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {branchNodes.map((node) => (
                      <div
                        key={`card-${node.id}`}
                        className={`rounded-md border px-3 py-2.5 text-xs ${
                          node.unlocked
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                            : node.available
                              ? node.affordable
                                ? "border-cyan-500/45 bg-cyan-500/10 text-cyan-100"
                                : "border-amber-500/45 bg-amber-500/10 text-amber-100"
                              : "border-slate-700 bg-slate-900/55 text-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {node.image ? (
                            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md">
                              <Image src={node.image} alt={node.unitName} fill sizes="40px" className="object-cover" draggable={false} />
                            </div>
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-800 text-base">{node.icon}</div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold leading-tight">{node.name}</div>
                            <div className="mt-0.5 flex items-center gap-2 text-[10px] opacity-75">
                              <span>{node.cost}g</span>
                              {node.damage !== null && <span className="text-red-300">⚔{node.damage}</span>}
                              {node.maxHealth !== null && <span className="text-emerald-300">♥{node.maxHealth}</span>}
                            </div>
                          </div>
                          <span className="shrink-0 text-[9px] opacity-70">
                            {node.unlocked ? "✓" : node.available ? (node.affordable ? "▶" : "✕") : "🔒"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <style jsx>{`
          @keyframes fadeNode {
            from { opacity: 0; transform: scale(0.88); }
            to   { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </Card>
    </div>
  );
}
