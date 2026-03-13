import { BASIC_SOLDIER_IMAGE, WARRIOR_IMAGE, STRONG_SOLDIER_IMAGE, TANK_IMAGE, ATTACK_CHOPTER_IMAGE, UNIT_IMAGE } from "@/lib/game/unitAssets";
import { UNIT_STATS } from "@/lib/game/unitSystem";
import { COLOR_HEX } from "@/lib/game/constants";
import type { PlayerColor, Unit } from "@/lib/game/types";

type Props = {
  unit: Unit;
  x: number;
  y: number;
  selected: boolean;
  playerColor?: PlayerColor;
  isRegening?: boolean;
  opacity?: number;
  offsetX?: number;
  offsetY?: number;
  rotationDeg?: number;
  scale?: number;
  transitionMs?: number;
  easing?: string;
  hitFlash?: boolean;
  ghost?: boolean;
  donorColor?: PlayerColor;
  onClick?: () => void;
};

export function UnitRenderer({
  unit,
  x,
  y,
  selected,
  playerColor,
  isRegening,
  opacity = 1,
  offsetX = 0,
  offsetY = 0,
  rotationDeg = 0,
  scale = 1,
  transitionMs = 0,
  easing = "ease-out",
  hitFlash = false,
  ghost = false,
  donorColor,
  onClick
}: Props) {
  const stats = UNIT_STATS[unit.type];
  const healthRatio = Math.max(0, Math.min(1, unit.health / stats.maxHealth));
  const healthPct = Math.round(healthRatio * 100);

  const imageHref =
    unit.type === "basic_soldier" && playerColor
      ? (BASIC_SOLDIER_IMAGE[playerColor] ?? UNIT_IMAGE.basic_soldier)
      : unit.type === "strong_soldier" && playerColor
        ? (STRONG_SOLDIER_IMAGE[playerColor] ?? UNIT_IMAGE.strong_soldier)
        : unit.type === "warrior" && playerColor
          ? (WARRIOR_IMAGE[playerColor] ?? UNIT_IMAGE.warrior)
          : unit.type === "tank" && playerColor
            ? (TANK_IMAGE[playerColor] ?? UNIT_IMAGE.tank)
            : unit.type === "attack_helicopter" && playerColor
              ? (ATTACK_CHOPTER_IMAGE[playerColor] ?? UNIT_IMAGE.attack_helicopter)
              : UNIT_IMAGE[unit.type];

  return (
    <g
      style={{
        transform: `translate(${x}px, ${y}px)`,
        transition: transitionMs > 0 ? `transform ${transitionMs}ms ${easing}` : undefined,
        userSelect: "none",
        opacity
      }}
      onDragStart={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
    >
      <g
        style={{
          transform: `translate(${offsetX}px, ${offsetY}px) rotate(${rotationDeg}deg) scale(${scale})`,
          transition: transitionMs > 0 ? `transform ${transitionMs}ms ${easing}` : undefined
        }}
      >
      {isRegening && (
        <>
          <defs>
            <style>{`
              @keyframes regen-float {
                0%   { transform: translateY(0px);  opacity: 1; }
                60%  { transform: translateY(-14px); opacity: 0.9; }
                100% { transform: translateY(-22px); opacity: 0; }
              }
              .regen-float { animation: regen-float 0.9s ease-out forwards; }
            `}</style>
          </defs>
          <text
            x="0"
            y="-18"
            textAnchor="middle"
            fontSize="9"
            fontWeight="bold"
            fill="#4ade80"
            stroke="#14532d"
            strokeWidth="0.4"
            pointerEvents="none"
            className="regen-float"
          >
            +1
          </text>
        </>
      )}
      <circle
        cx="0"
        cy="0"
        r="17"
        fill="transparent"
        onClick={onClick}
        className="cursor-pointer"
      />
      {(() => {
        const large = unit.type === "patriot" || unit.type === "attack_helicopter" || unit.type === "aircraft";
        const chopterXL = unit.type === "attack_helicopter" && playerColor && playerColor !== "blue";
        const w = chopterXL ? 56 : large ? 34 : 26;
        const h = chopterXL ? 56 : large ? 34 : 26;
        return (
          <image
            href={imageHref}
            x={-w / 2}
            y={-(h / 2) - 3}
            width={w}
            height={h}
            pointerEvents="none"
            style={{ imageRendering: "auto" }}
          />
        );
      })()}
      <rect x="-11" y="9" width="22" height="3.2" rx="1.6" fill="#334155" opacity="0.85" pointerEvents="none" />
      <rect x="-11" y="9" width={22 * healthRatio} height="3.2" rx="1.6" fill={healthRatio > 0.5 ? "#22c55e" : healthRatio > 0.25 ? "#f59e0b" : "#ef4444"} pointerEvents="none" />
      <text x="0" y="17" textAnchor="middle" fontSize={selected ? 8 : 7} fill={selected ? "#67e8f9" : "#e2e8f0"} pointerEvents="none">
        {unit.health}/{stats.maxHealth}
      </text>
      {healthPct < 100 && (
        <circle cx="11" cy="-9" r="3.8" fill="#fecaca" pointerEvents="none" />
      )}
      {donorColor && (
        <g transform="translate(-11, -20)" pointerEvents="none">
          <rect x="-4" y="-4" width="8" height="8" rx="1" fill={COLOR_HEX[donorColor]} opacity="0.95" transform="rotate(45)" />
          <rect x="-4" y="-4" width="8" height="8" rx="1" fill="none" stroke="#0f172a" strokeWidth="1.2" opacity="0.7" transform="rotate(45)" />
        </g>
      )}
      {hitFlash && (
        <>
          <circle cx="0" cy="0" r="19" fill={ghost ? "#f97316" : "#f8fafc"} opacity="0.26" pointerEvents="none" />
          <circle cx="0" cy="0" r="21" fill="none" stroke="#f8fafc" strokeWidth="1.4" opacity="0.45" pointerEvents="none" />
        </>
      )}
      </g>
    </g>
  );
}
