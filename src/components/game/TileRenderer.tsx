import clsx from "clsx";
import type { MouseEvent } from "react";
import { COLOR_HEX } from "@/lib/game/constants";
import { makeHexPoints } from "@/lib/game/map";
import type { Player, Tile } from "@/lib/game/types";

type Props = {
  tile: Tile;
  playersById: Map<string, Player>;
  centerX: number;
  centerY: number;
  size: number;
  discovered: boolean;
  selected: boolean;
  hovered: boolean;
  moveTarget: boolean;
  attackTarget: boolean;
  hasHiddenActivity: boolean;
  onClick: () => void;
  onMouseEnter: (event: MouseEvent<SVGGElement>) => void;
  onMouseLeave: () => void;
};

export function TileRenderer({
  tile,
  playersById,
  centerX,
  centerY,
  size,
  discovered,
  selected,
  hovered,
  moveTarget,
  attackTarget,
  hasHiddenActivity,
  onClick,
  onMouseEnter,
  onMouseLeave
}: Props) {
  const owner = tile.ownerId ? playersById.get(tile.ownerId) : null;

  const baseFill = discovered
    ? owner
      ? COLOR_HEX[owner.color]
      : "#1f2937"
    : "#020617";

  const fillOpacity = discovered ? (owner ? 0.55 : 0.35) : 0.95;

  const stroke = selected
    ? "#f8fafc"
    : attackTarget
      ? "#ef4444"
      : moveTarget
        ? "#22d3ee"
        : hovered
          ? "#67e8f9"
          : discovered
            ? "#475569"
            : "#0f172a";

  return (
    <g className={clsx("cursor-pointer transition-all duration-150")} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <polygon
        points={makeHexPoints(centerX, centerY, size)}
        fill={baseFill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={selected || moveTarget || attackTarget ? 2.6 : 1.2}
      />

      {!discovered && (
        <g transform={`translate(${centerX} ${centerY})`} opacity="0.45">
          <path d={`M ${-size * 0.42} ${size * 0.1} L ${size * 0.42} ${-size * 0.1}`} stroke="#334155" strokeWidth="1.4" />
          <path d={`M ${-size * 0.2} ${size * 0.3} L ${size * 0.3} ${-size * 0.2}`} stroke="#334155" strokeWidth="1.1" />
        </g>
      )}

      {!discovered && hasHiddenActivity && (
        <g transform={`translate(${centerX} ${centerY})`} style={{ pointerEvents: "none" }}>
          <circle r={size * 0.32} fill="#f97316" opacity="0">
            <animate attributeName="opacity" values="0;0.18;0" dur="2.2s" repeatCount="indefinite" />
            <animate attributeName="r" values={`${size * 0.22};${size * 0.42};${size * 0.22}`} dur="2.2s" repeatCount="indefinite" />
          </circle>
          <circle r={size * 0.18} fill="#431407" opacity="0.92" />
          <circle r={size * 0.18} fill="none" stroke="#f97316" strokeWidth="1">
            <animate attributeName="opacity" values="1;0.5;1" dur="2.2s" repeatCount="indefinite" />
          </circle>
          <text
            x="0"
            y="0.5"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={Math.max(7, size * 0.19)}
            fontWeight="700"
            fill="#fed7aa"
          >!</text>
        </g>
      )}

      {discovered && tile.isCapital && (
        <image
          href="/units/capital.png"
          x={centerX - size}
          y={centerY - size * 1.1}
          width={size * 2}
          height={size * 2}
          pointerEvents="none"
        />
      )}

      {discovered && tile.villageId && (() => {
        const cityColor = owner?.color;
        const cityImg = cityColor && ["blue", "red", "green", "purple", "yellow"].includes(cityColor)
          ? `/units/city_${cityColor}.png`
          : "/units/city.png";
        return (
          <image
            href={cityImg}
            x={centerX - size * 0.8}
            y={centerY - size * 0.96}
            width={size * 1.6}
            height={size * 1.6}
            pointerEvents="none"
          />
        );
      })()}

      {discovered && tile.hasGoldMine && (
        <g transform={`translate(${centerX + size * 0.16} ${centerY - size * 0.34})`}>
          <text x="0" y="0" fontSize={Math.max(10, size * 0.4)} fill="#fbbf24">
            ⛏
          </text>
        </g>
      )}
    </g>
  );
}
