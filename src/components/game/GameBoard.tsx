"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ATTACK_EASING,
  ATTACK_RECOIL_BY_TYPE,
  DEATH_FADE_MS,
  HIT_SHAKE_DISTANCE,
  MOVE_EASING,
  MOVE_STEP_DURATION_MS,
  MOVE_STEP_SETTLE_MS,
  TARGET_HIT_FLASH_MS
} from "@/lib/game/animationConfig";
import { axialDistance, axialToPixel, makeHexPoints } from "@/lib/game/map";
import { previewUnitAction } from "@/lib/game/unitActionPreview";
import { UNIT_STATS } from "@/lib/game/unitSystem";
import type { PlayerColor, Unit } from "@/lib/game/types";
import { useGameStore } from "@/store/gameStore";
import { ANIM_CLEANUP_MS, ATTACK_IMPACT_MS, AttackAnimationLayer } from "./AttackAnimationLayer";
import type { AttackAnimEvent } from "./AttackAnimationLayer";
import { HexTile } from "./HexTile";
import { UnitRenderer } from "./UnitRenderer";

const HEX_SIZE = 27;
const PADDING_X = 75;
const PADDING_Y = 55;

type Props = {
  suppressClicks?: boolean;
};

type TapKind = "unit" | "building" | "tile" | "fog";
type TapRipple = { id: number; cx: number; cy: number; color: string; kind: TapKind };

type UnitVisualFx = {
  offsetX?: number;
  offsetY?: number;
  rotationDeg?: number;
  scale?: number;
  opacity?: number;
  transitionMs?: number;
  easing?: string;
  hitFlash?: boolean;
};

type MovingOverlay = {
  unit: Unit;
  playerColor?: PlayerColor;
  x: number;
  y: number;
  rotationDeg: number;
  scale: number;
  transitionMs: number;
  easing: string;
};

type DeathOverlay = {
  id: number;
  unit: Unit;
  playerColor?: PlayerColor;
  x: number;
  y: number;
  opacity: number;
  scale: number;
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function GameBoard({ suppressClicks = false }: Props) {
  const [attackAnims, setAttackAnims] = useState<AttackAnimEvent[]>([]);
  const [tapRipples, setTapRipples] = useState<TapRipple[]>([]);
  const [unitFxById, setUnitFxById] = useState<Record<string, UnitVisualFx>>({});
  const [movingOverlay, setMovingOverlay] = useState<MovingOverlay | null>(null);
  const [deathOverlays, setDeathOverlays] = useState<DeathOverlay[]>([]);
  const animIdRef = useRef(0);
  const {
    tiles,
    units,
    players,
    fogOfWar,
    currentPlayerId,
    humanPlayerId,
    hiddenMoveTileKeys,
    selectedTileKey,
    hoveredTileKey,
    selectedUnitId,
    aiTurnInProgress,
    actionAnimationBusy,
    pendingAnimatedAction,
    peaceTreaties,
    justBrokePeace,
    regenAnimUnitIds,
    unitDonorColors,
    selectTile,
    hoverTile,
    selectUnit,
    queueAnimatedUnitAction,
    clearPendingAnimatedAction,
    setActionAnimationBusy,
    attemptUnitAction,
    clearRegenAnims
  } = useGameStore(
    useShallow((state) => ({
      tiles: state.tiles,
      units: state.units,
      players: state.players,
      fogOfWar: state.fogOfWar,
      currentPlayerId: state.currentPlayerId,
      humanPlayerId: state.humanPlayerId,
      hiddenMoveTileKeys: state.hiddenMoveTileKeys,
      selectedTileKey: state.selectedTileKey,
      hoveredTileKey: state.hoveredTileKey,
      selectedUnitId: state.selectedUnitId,
      aiTurnInProgress: state.aiTurnInProgress,
      actionAnimationBusy: state.actionAnimationBusy,
      pendingAnimatedAction: state.pendingAnimatedAction,
      peaceTreaties: state.peaceTreaties,
      justBrokePeace: state.justBrokePeace,
      regenAnimUnitIds: state.regenAnimUnitIds,
      unitDonorColors: state.unitDonorColors,
      selectTile: state.selectTile,
      hoverTile: state.hoverTile,
      selectUnit: state.selectUnit,
      queueAnimatedUnitAction: state.queueAnimatedUnitAction,
      clearPendingAnimatedAction: state.clearPendingAnimatedAction,
      setActionAnimationBusy: state.setActionAnimationBusy,
      attemptUnitAction: state.attemptUnitAction,
      clearRegenAnims: state.clearRegenAnims
    }))
  );

  useEffect(() => {
    if (regenAnimUnitIds.length === 0) return;
    const timer = setTimeout(clearRegenAnims, 1000);
    return () => clearTimeout(timer);
  }, [regenAnimUnitIds, clearRegenAnims]);

  const humanFactionId = humanPlayerId ?? currentPlayerId;
  const perspectiveId = humanPlayerId ?? currentPlayerId;

  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const unitsByTile = useMemo(() => new Map(units.map((unit) => [unit.tileKey, unit])), [units]);
  const selectedUnit = useMemo(() => units.find((unit) => unit.id === selectedUnitId) ?? null, [units, selectedUnitId]);

  // Peace allies - used for movement/attack checks
  const peaceAllyIds = useMemo(() => {
    if (!perspectiveId) return new Set<string>();
    return new Set(
      peaceTreaties
        .filter((t) => t.playerA === perspectiveId || t.playerB === perspectiveId)
        .map((t) => (t.playerA === perspectiveId ? t.playerB : t.playerA))
    );
  }, [peaceTreaties, perspectiveId]);

  // Peace allies share full discovered fog with each other
  const peaceAllyDiscoveredKeys = useMemo(() => {
    if (peaceAllyIds.size === 0) return new Set<string>();
    const keys = new Set<string>();
    for (const allyId of peaceAllyIds) {
      const allyFog = fogOfWar[allyId] ?? {};
      for (const key of Object.keys(allyFog)) {
        keys.add(key);
      }
    }
    return keys;
  }, [peaceAllyIds, fogOfWar]);

  const points = useMemo(() => {
    const raw = tiles.map((tile) => {
      const pixel = axialToPixel(tile.q, tile.r, HEX_SIZE);
      return { tile, x: pixel.x, y: pixel.y };
    });

    const minX = raw.reduce((min, p) => Math.min(min, p.x), Infinity);
    const minY = raw.reduce((min, p) => Math.min(min, p.y), Infinity);
    const maxX = raw.reduce((max, p) => Math.max(max, p.x), -Infinity);
    const maxY = raw.reduce((max, p) => Math.max(max, p.y), -Infinity);

    const all = raw.map(({ tile, x, y }) => ({
      tile,
      x: x - minX + PADDING_X,
      y: y - minY + PADDING_Y
    }));

    const width = maxX - minX + HEX_SIZE * 2 + PADDING_X * 2;
    const height = maxY - minY + HEX_SIZE * 2 + PADDING_Y * 2;

    return { points: all, width, height };
  }, [tiles]);

  const pointsByTileKey = useMemo(
    () => new Map(points.points.map((point) => [point.tile.key, point])),
    [points.points]
  );

  const setUnitFx = useCallback((unitId: string, nextFx: UnitVisualFx | null) => {
    setUnitFxById((prev) => {
      if (nextFx === null) {
        const rest = { ...prev };
        delete rest[unitId];
        return rest;
      }
      return { ...prev, [unitId]: nextFx };
    });
  }, []);

  const playHitFx = useCallback((unitId: string) => {
    setUnitFx(unitId, {
      offsetX: HIT_SHAKE_DISTANCE,
      offsetY: -2,
      scale: 1.04,
      hitFlash: true,
      transitionMs: 70,
      easing: ATTACK_EASING
    });

    window.setTimeout(() => {
      setUnitFx(unitId, {
        offsetX: -HIT_SHAKE_DISTANCE * 0.65,
        offsetY: 2,
        scale: 0.98,
        hitFlash: true,
        transitionMs: 85,
        easing: ATTACK_EASING
      });
    }, 72);

    window.setTimeout(() => {
      setUnitFx(unitId, null);
    }, TARGET_HIT_FLASH_MS);
  }, [setUnitFx]);

  const spawnAttackAnim = useCallback((event: Omit<AttackAnimEvent, "id">) => {
    const id = ++animIdRef.current;
    setAttackAnims((prev) => [...prev, { id, ...event }]);
    window.setTimeout(() => {
      setAttackAnims((prev) => prev.filter((entry) => entry.id !== id));
    }, ANIM_CLEANUP_MS[event.attackerType] ?? 600);
  }, []);

  const spawnDeathOverlay = useCallback((unitId: string, tileKey: string) => {
    const unit = units.find((entry) => entry.id === unitId);
    const point = pointsByTileKey.get(tileKey);
    if (!unit || !point) return;

    const id = ++animIdRef.current;
    const playerColor = playersById.get(unit.ownerId)?.color;
    setDeathOverlays((prev) => [
      ...prev,
      {
        id,
        unit,
        playerColor,
        x: point.x,
        y: point.y,
        opacity: 1,
        scale: 1
      }
    ]);

    window.setTimeout(() => {
      setDeathOverlays((prev) =>
        prev.map((overlay) =>
          overlay.id === id
            ? {
              ...overlay,
              opacity: 0,
              scale: 0.72
            }
            : overlay
        )
      );
    }, 16);

    window.setTimeout(() => {
      setDeathOverlays((prev) => prev.filter((overlay) => overlay.id !== id));
    }, DEATH_FADE_MS + 32);
  }, [playersById, pointsByTileKey, units]);

  useEffect(() => {
    if (!pendingAnimatedAction) return;

    let cancelled = false;

    const run = async () => {
      const previewResult = previewUnitAction({
        units,
        tiles,
        peaceTreaties,
        currentPlayerId,
        justBrokePeace,
        unitId: pendingAnimatedAction.unitId,
        targetTileKey: pendingAnimatedAction.targetTileKey
      });

      if (!previewResult.ok) {
        clearPendingAnimatedAction(pendingAnimatedAction.id);
        window.alert(previewResult.error);
        return;
      }

      const { preview } = previewResult;
      const sourcePoint = pointsByTileKey.get(preview.sourceTile.key);
      const targetPoint = pointsByTileKey.get(preview.targetTile.key);
      if (!sourcePoint || !targetPoint) {
        clearPendingAnimatedAction(pendingAnimatedAction.id);
        return;
      }

      setActionAnimationBusy(true);
      selectUnit(null);

      try {
        if (preview.kind === "move") {
          const playerColor = playersById.get(preview.unit.ownerId)?.color;
          setMovingOverlay({
            unit: preview.unit,
            playerColor,
            x: sourcePoint.x,
            y: sourcePoint.y,
            rotationDeg: 0,
            scale: 1,
            transitionMs: 0,
            easing: MOVE_EASING
          });

          // Double rAF: ensures the browser has painted the unit at the source
          // position before CSS transitions start, preventing an instant jump.
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          });

          for (let index = 1; index < preview.path.length; index += 1) {
            if (cancelled) return;
            const fromPoint = pointsByTileKey.get(preview.path[index - 1].key);
            const nextPoint = pointsByTileKey.get(preview.path[index].key);
            if (!fromPoint || !nextPoint) continue;

            const dx = nextPoint.x - fromPoint.x;
            const dy = nextPoint.y - fromPoint.y;
            const heading = Math.atan2(dy, dx) * (180 / Math.PI);

            setMovingOverlay((current) =>
              current
                ? {
                  ...current,
                  x: nextPoint.x,
                  y: nextPoint.y,
                  rotationDeg: heading / 10,
                  scale: 1.04,
                  transitionMs: MOVE_STEP_DURATION_MS,
                  easing: MOVE_EASING
                }
                : current
            );

            await sleep(MOVE_STEP_DURATION_MS + MOVE_STEP_SETTLE_MS);
          }

          setMovingOverlay(null);
          const result = attemptUnitAction(preview.unit.id, preview.targetTile.key, { skipAnimationLock: true });
          if (!result.ok && result.error) {
            window.alert(result.error);
          }
        } else {
          const dx = targetPoint.x - sourcePoint.x;
          const dy = targetPoint.y - sourcePoint.y;
          const length = Math.max(1, Math.hypot(dx, dy));
          const recoil = ATTACK_RECOIL_BY_TYPE[preview.unit.type];
          const recoilX = -(dx / length) * recoil;
          const recoilY = -(dy / length) * recoil;
          const tilt = (dx / length) * 7;

          setUnitFx(preview.unit.id, {
            offsetX: recoilX,
            offsetY: recoilY,
            rotationDeg: tilt,
            scale: 1.05,
            transitionMs: 90,
            easing: ATTACK_EASING
          });

          window.setTimeout(() => {
            setUnitFx(preview.unit.id, {
              offsetX: 0,
              offsetY: 0,
              rotationDeg: 0,
              scale: 1,
              transitionMs: 120,
              easing: ATTACK_EASING
            });
            window.setTimeout(() => setUnitFx(preview.unit.id, null), 125);
          }, 95);

          spawnAttackAnim({
            attackerType: preview.unit.type,
            fromX: sourcePoint.x,
            fromY: sourcePoint.y,
            toX: targetPoint.x,
            toY: targetPoint.y
          });

          await sleep(ATTACK_IMPACT_MS[preview.unit.type] ?? 220);
          if (cancelled) return;

          const result = attemptUnitAction(preview.unit.id, preview.targetTile.key, { skipAnimationLock: true });
          if (!result.ok) {
            if (result.error) window.alert(result.error);
          } else if (preview.combat.defenderDestroyed) {
            spawnDeathOverlay(preview.targetUnit.id, preview.targetTile.key);
          } else {
            playHitFx(preview.targetUnit.id);
          }
        }
      } finally {
        clearPendingAnimatedAction(pendingAnimatedAction.id);
        setActionAnimationBusy(false);
        setMovingOverlay(null);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    attemptUnitAction,
    clearPendingAnimatedAction,
    currentPlayerId,
    justBrokePeace,
    peaceTreaties,
    pendingAnimatedAction,
    playersById,
    pointsByTileKey,
    playHitFx,
    selectUnit,
    setActionAnimationBusy,
    setUnitFx,
    spawnAttackAnim,
    spawnDeathOverlay,
    tiles,
    units
  ]);

  const hiddenStaticUnitId = movingOverlay?.unit.id ?? null;

  return (
    <div className="relative h-full w-full">
      <svg viewBox={`0 0 ${points.width} ${points.height}`} className="h-full w-full">
        <defs>
          <style>{`
            @keyframes tap-hex {
              0%   { transform: scale(0.82); opacity: 0.45; }
              40%  { transform: scale(1.16); opacity: 0.22; }
              72%  { transform: scale(0.97); opacity: 0.07; }
              100% { transform: scale(1.0);  opacity: 0; }
            }
            @keyframes tap-circle {
              0%   { transform: scale(0.76); opacity: 0.48; }
              40%  { transform: scale(1.22); opacity: 0.26; }
              72%  { transform: scale(0.95); opacity: 0.07; }
              100% { transform: scale(1.0);  opacity: 0; }
            }
            .tap-hex    { animation: tap-hex    0.28s ease-out forwards; transform-box: fill-box; transform-origin: 50% 50%; }
            .tap-circle { animation: tap-circle 0.28s ease-out forwards; transform-box: fill-box; transform-origin: 50% 50%; }
          `}</style>
        </defs>
        {points.points.map(({ tile, x, y }) => {
          const unit = unitsByTile.get(tile.key) ?? null;
          const discovered = Boolean(
            perspectiveId && (
              fogOfWar[perspectiveId]?.[tile.key] ||
              peaceAllyDiscoveredKeys.has(tile.key)
            )
          );
          const selected = selectedTileKey === tile.key;
          const hovered = hoveredTileKey === tile.key;
          const hasHiddenActivity = !discovered && hiddenMoveTileKeys.includes(tile.key);

          const canAct = Boolean(
            !aiTurnInProgress &&
            !actionAnimationBusy &&
            selectedUnit &&
            selectedUnit.ownerId === humanFactionId &&
            !selectedUnit.hasMovedThisTurn
          );
          const actingUnit = canAct ? selectedUnit : null;

          const sourceTileForHighlight = actingUnit
            ? tiles.find((entry) => entry.key === actingUnit.tileKey) ?? null
            : null;

          const distForHighlight = sourceTileForHighlight ? axialDistance(sourceTileForHighlight, tile) : Infinity;
          const isEnemyOnTile = unit !== null && unit.ownerId !== currentPlayerId;

          const actingUnitStats = actingUnit ? UNIT_STATS[actingUnit.type] : null;
          const isAirActingUnit = actingUnitStats?.domain === "air";
          const actingUnitMovesLeft = actingUnit
            ? (() => {
                if (!isAirActingUnit) return actingUnitStats!.movementRange;
                const used = actingUnit.movesUsed ?? 0;
                if (used > 0 && !actingUnit.hasAttackedThisTurn) return 0; // must attack before 2nd move
                if (actingUnit.hasAttackedThisTurn) return actingUnitStats!.movementRange - used; // post-attack leg
                return actingUnitStats!.movementRange; // fresh, full range
              })()
            : 0;

          const moveTarget = Boolean(
            discovered &&
            actingUnit &&
            !isEnemyOnTile &&
            distForHighlight > 0 &&
            distForHighlight <= actingUnitMovesLeft &&
            !(isAirActingUnit && (tile.isCapital || tile.villageId !== null))
          );

          const attackDomainValid = (() => {
            if (!actingUnit || !unit) return false;
            const attackerType = actingUnit.type;
            const defenderDomain = UNIT_STATS[unit.type].domain;
            if (attackerType === "patriot") return defenderDomain === "air";
            if (UNIT_STATS[attackerType].domain === "ground" && defenderDomain === "air") return false;
            return true;
          })();

          const attackTarget = Boolean(
            discovered &&
            actingUnit &&
            !actingUnit.hasAttackedThisTurn &&
            isEnemyOnTile &&
            distForHighlight > 0 &&
            distForHighlight <= UNIT_STATS[actingUnit.type].attackRange &&
            attackDomainValid
          );

          return (
            <HexTile
              key={tile.key}
              tile={tile}
              unit={unit && unit.id !== hiddenStaticUnitId ? unit : null}
              playersById={playersById}
              centerX={x}
              centerY={y}
              size={HEX_SIZE}
              discovered={discovered}
              selected={selected}
              hovered={hovered}
              unitSelected={selectedUnitId === unit?.id}
              moveTarget={moveTarget}
              attackTarget={attackTarget}
              hasHiddenActivity={hasHiddenActivity}
              isRegening={unit !== null && regenAnimUnitIds.includes(unit.id)}
              unitVisualFx={unit ? unitFxById[unit.id] : undefined}
              unitDonorColor={unit ? unitDonorColors[unit.id] : undefined}
              onClick={() => {
                if (suppressClicks || aiTurnInProgress || actionAnimationBusy) return;

                if (tile.key === selectedTileKey || (unit && unit.id === selectedUnitId)) {
                  selectTile(null);
                  selectUnit(null);
                  return;
                }

                selectTile(tile.key);

                const kind: TapKind =
                  unit ? "unit"
                  : (tile.isCapital || tile.villageId) ? "building"
                  : discovered ? "tile"
                  : "fog";
                const color =
                  unit && unit.ownerId !== humanFactionId ? "#f87171"
                  : unit && unit.ownerId === humanFactionId ? "#38bdf8"
                  : kind === "building" ? "#fbbf24"
                  : kind === "fog" ? "#475569"
                  : "#94a3b8";
                const rippleId = ++animIdRef.current;
                setTapRipples((prev) => [...prev, { id: rippleId, cx: x, cy: y, color, kind }]);
                window.setTimeout(() => setTapRipples((prev) => prev.filter((r) => r.id !== rippleId)), 320);

                if (!humanFactionId) return;

                if (discovered && unit?.ownerId === humanFactionId) {
                  selectUnit(unit.id);
                  return;
                }

                if (selectedUnitId && selectedUnit) {
                  queueAnimatedUnitAction(selectedUnitId, tile.key);
                }
              }}
              onMouseEnter={() => hoverTile(tile.key)}
              onMouseLeave={() => hoverTile(null)}
            />
          );
        })}
        {tapRipples.map((ripple) => (
          <g key={ripple.id} transform={`translate(${ripple.cx} ${ripple.cy})`} pointerEvents="none">
            {ripple.kind === "tile" || ripple.kind === "fog"
              ? <polygon points={makeHexPoints(0, 0, HEX_SIZE)} fill={ripple.color} className="tap-hex" />
              : <circle cx="0" cy="0" r={ripple.kind === "building" ? HEX_SIZE * 0.75 : HEX_SIZE * 0.55} fill={ripple.color} className="tap-circle" />
            }
          </g>
        ))}
        {movingOverlay && (
          <UnitRenderer
            unit={movingOverlay.unit}
            x={movingOverlay.x}
            y={movingOverlay.y}
            selected
            playerColor={movingOverlay.playerColor}
            rotationDeg={movingOverlay.rotationDeg}
            scale={movingOverlay.scale}
            transitionMs={movingOverlay.transitionMs}
            easing={movingOverlay.easing}
            ghost
          />
        )}
        {deathOverlays.map((overlay) => (
          <UnitRenderer
            key={overlay.id}
            unit={overlay.unit}
            x={overlay.x}
            y={overlay.y}
            selected={false}
            playerColor={overlay.playerColor}
            opacity={overlay.opacity}
            scale={overlay.scale}
            transitionMs={DEATH_FADE_MS}
            easing={ATTACK_EASING}
            hitFlash
            ghost
          />
        ))}
        <AttackAnimationLayer events={attackAnims} />
      </svg>
    </div>
  );
}
