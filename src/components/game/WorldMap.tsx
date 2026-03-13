"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useGameStore } from "@/store/gameStore";
import { UNIT_STATS } from "@/lib/game/unitSystem";
import { GameBoard } from "./GameBoard";
import { StarfieldCanvas } from "./StarfieldCanvas";
import { useTranslation } from "@/lib/i18n/LanguageContext";

export function WorldMap() {
  const { t } = useTranslation();
  const MIN_ZOOM = 0.45;
  const MAX_ZOOM = 4;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [suppressTileClicks, setSuppressTileClicks] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const dragStateRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0
  });

  const { tiles, units, players, selectedTileKey, hoveredTileKey, fogOfWar, currentPlayerId, humanPlayerId } = useGameStore(
    useShallow((state) => ({
      tiles: state.tiles,
      units: state.units,
      players: state.players,
      selectedTileKey: state.selectedTileKey,
      hoveredTileKey: state.hoveredTileKey,
      fogOfWar: state.fogOfWar,
      currentPlayerId: state.currentPlayerId,
      humanPlayerId: state.humanPlayerId
    }))
  );

  const perspectiveId = humanPlayerId ?? currentPlayerId;

  const inspectedTileKey = selectedTileKey ?? hoveredTileKey;
  const info = useMemo(() => {
    if (!inspectedTileKey || !perspectiveId) return null;
    const tile = tiles.find((entry) => entry.key === inspectedTileKey);
    if (!tile) return null;

    const discovered = Boolean(fogOfWar[perspectiveId]?.[tile.key]);
    if (!discovered) {
      return {
        coord: `${tile.q},${tile.r}`,
        discovered: false
      };
    }

    const owner = players.find((player) => player.id === tile.ownerId);
    const unit = units.find((entry) => entry.tileKey === tile.key) ?? null;

    return {
      coord: `${tile.q},${tile.r}`,
      discovered: true,
      owner: owner?.color ?? "neutral",
      isCapital: tile.isCapital,
      hasVillage: Boolean(tile.villageId),
      hasGoldMine: tile.hasGoldMine,
      unitName: unit ? UNIT_STATS[unit.type].name : "None",
      unitMoved: unit ? (unit.hasMovedThisTurn ? "Yes" : "No") : "-",
      unitHealth: unit ? `${unit.health}/${UNIT_STATS[unit.type].maxHealth}` : "-"
    };
  }, [perspectiveId, fogOfWar, inspectedTileKey, players, tiles, units]);

  // Attach a non-passive wheel listener so preventDefault() actually blocks page scroll.
  // React's synthetic onWheel is passive by default and cannot prevent scrolling.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();

      const rect = el.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const zoomFactor = Math.exp(-event.deltaY * 0.0015);
      setZoom((currentZoom) => {
        const nextZoom = clampZoom(currentZoom * zoomFactor);
        if (nextZoom === currentZoom) return currentZoom;

        setPan((currentPan) => {
          const worldX = (centerX - currentPan.x) / currentZoom;
          const worldY = (centerY - currentPan.y) / currentZoom;
          return {
            x: centerX - worldX * nextZoom,
            y: centerY - worldY * nextZoom
          };
        });

        return nextZoom;
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (event: MouseEvent) => {
      const drag = dragStateRef.current;
      if (!drag.active) return;

      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const movedNow = Math.abs(dx) + Math.abs(dy) > 4;

      if (movedNow) {
        drag.moved = true;
        setSuppressTileClicks(true);
      }

      setPan({ x: drag.originX + dx, y: drag.originY + dy });
    };

    const onMouseUp = () => {
      const drag = dragStateRef.current;
      drag.active = false;
      setIsDragging(false);

      if (drag.moved) {
        window.setTimeout(() => setSuppressTileClicks(false), 0);
      }
      drag.moved = false;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging]);

  const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

  return (
    <Card className="relative overflow-hidden p-0">
      <div className="relative h-[68vh] min-h-[560px] w-full overflow-hidden" style={{ background: "#020610" }}>
        <StarfieldCanvas pan={pan} />

        <div
          ref={viewportRef}
          className={`absolute inset-0 overflow-hidden ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
          onMouseDown={(event) => {
            if (event.button !== 0) return;

            dragStateRef.current = {
              active: true,
              moved: false,
              startX: event.clientX,
              startY: event.clientY,
              originX: pan.x,
              originY: pan.y
            };
            setIsDragging(true);
          }}
        >
          <div
            className={`h-full w-full ${isDragging ? "transition-none" : "transition-transform duration-150"}`}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0"
            }}
          >
            <GameBoard suppressClicks={suppressTileClicks} />
          </div>
        </div>

        <div className="absolute right-3 top-3 flex items-center gap-2 rounded-md border border-border bg-panel/90 px-2 py-2">
          <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => setZoom((current) => clampZoom(Number((current - 0.1).toFixed(2))))}>
            {t.worldMap.zoomOut}
          </Button>
          <span className="min-w-12 text-center text-xs text-slate-300">{Math.round(zoom * 100)}%</span>
          <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => setZoom((current) => clampZoom(Number((current + 0.1).toFixed(2))))}>
            {t.worldMap.zoomIn}
          </Button>
        </div>

        <div className="absolute bottom-3 left-3 rounded-md border border-border bg-panel/90 px-3 py-2 text-xs text-slate-200">
          {info ? (
            <>
              <div>{t.worldMap.tileLabel} {info.coord}</div>
              {info.discovered ? (
                <>
                  <div className="capitalize">{t.worldMap.ownerLabel} {info.owner}</div>
                  <div>{t.worldMap.capitalLabel} {info.isCapital ? t.worldMap.yes : t.worldMap.no}</div>
                  <div>{t.worldMap.cityLabel} {info.hasVillage ? t.worldMap.yes : t.worldMap.no}</div>
                  <div>{t.worldMap.goldMineLabel} {info.hasGoldMine ? t.worldMap.yes : t.worldMap.no}</div>
                  <div>{t.worldMap.unitLabel} {info.unitName}</div>
                  <div>{t.worldMap.unitHpLabel} {info.unitHealth}</div>
                  <div>{t.worldMap.movedThisTurn} {info.unitMoved}</div>
                </>
              ) : (
                <div>{t.worldMap.undiscovered}</div>
              )}
            </>
          ) : (
            <div>{t.worldMap.hoverInspect}</div>
          )}
        </div>
      </div>
    </Card>
  );
}
