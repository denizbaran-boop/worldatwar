import type { MouseEvent } from "react";
import type { Player, PlayerColor, Tile, Unit } from "@/lib/game/types";
import { TileRenderer } from "@/components/game/TileRenderer";
import { UnitRenderer } from "@/components/game/UnitRenderer";

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

type Props = {
  tile: Tile;
  unit: Unit | null;
  playersById: Map<string, Player>;
  centerX: number;
  centerY: number;
  size: number;
  discovered: boolean;
  selected: boolean;
  hovered: boolean;
  unitSelected: boolean;
  moveTarget: boolean;
  attackTarget: boolean;
  hasHiddenActivity: boolean;
  isRegening?: boolean;
  unitVisualFx?: UnitVisualFx;
  unitDonorColor?: PlayerColor;
  onClick: () => void;
  onMouseEnter: (event: MouseEvent<SVGGElement>) => void;
  onMouseLeave: () => void;
};

export function HexTile({
  tile,
  unit,
  playersById,
  centerX,
  centerY,
  size,
  discovered,
  selected,
  hovered,
  unitSelected,
  moveTarget,
  attackTarget,
  hasHiddenActivity,
  isRegening,
  unitVisualFx,
  unitDonorColor,
  onClick,
  onMouseEnter,
  onMouseLeave
}: Props) {
  return (
    <g>
      <TileRenderer
        tile={tile}
        playersById={playersById}
        centerX={centerX}
        centerY={centerY}
        size={size}
        discovered={discovered}
        selected={selected}
        hovered={hovered}
        moveTarget={moveTarget}
        attackTarget={attackTarget}
        hasHiddenActivity={hasHiddenActivity}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
      {discovered && unit && (
        <UnitRenderer
          unit={unit}
          x={centerX}
          y={centerY}
          selected={unitSelected}
          playerColor={playersById.get(unit.ownerId)?.color}
          isRegening={isRegening}
          offsetX={unitVisualFx?.offsetX}
          offsetY={unitVisualFx?.offsetY}
          rotationDeg={unitVisualFx?.rotationDeg}
          scale={unitVisualFx?.scale}
          opacity={unitVisualFx?.opacity}
          transitionMs={unitVisualFx?.transitionMs}
          easing={unitVisualFx?.easing}
          hitFlash={unitVisualFx?.hitFlash}
          donorColor={unitDonorColor}
          onClick={onClick}
        />
      )}
    </g>
  );
}
