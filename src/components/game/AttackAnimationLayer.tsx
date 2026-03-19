"use client";

import type { UnitType } from "@/lib/game/types";

export type AttackAnimEvent = {
  id: number;
  attackerType: UnitType;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  isRanged?: boolean;
};

// How long each animation runs before the event is cleaned up (ms)
export const ANIM_CLEANUP_MS: Record<UnitType, number> = {
  basic_soldier: 400,
  strong_soldier: 550,
  warrior: 400,
  machine_gunner: 950,
  mortar: 1100,
  tank: 1050,
  aircraft: 600,
  patriot: 950,
  attack_helicopter: 650
};

export const ATTACK_IMPACT_MS: Record<UnitType, number> = {
  basic_soldier: 190,
  strong_soldier: 270,
  warrior: 160,
  machine_gunner: 180,
  mortar: 500,
  tank: 320,
  aircraft: 200,
  patriot: 420,
  attack_helicopter: 220
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function Bullet({
  fromX, fromY, dx, dy,
  color, size, travelDur, delay = 0
}: {
  fromX: number; fromY: number; dx: number; dy: number;
  color: string; size: number; travelDur: number; delay?: number;
}) {
  const path = `M 0 0 L ${dx} ${dy}`;
  return (
    <g transform={`translate(${fromX} ${fromY})`}>
      <circle r={size} fill={color} opacity="0">
        {/* reveal at delay */}
        <animate attributeName="opacity" values="0;0.95" dur="0.01s" begin={`${delay}s`} fill="freeze" />
        <animateMotion path={path} dur={`${travelDur}s`} begin={`${delay}s`} fill="freeze" />
        {/* hide after travel */}
        <animate attributeName="opacity" values="0.95;0" dur="0.07s" begin={`${delay + travelDur}s`} fill="freeze" />
      </circle>
    </g>
  );
}

function Explosion({
  cx, cy, begin, maxR,
  ringColor, flashColor
}: {
  cx: number; cy: number; begin: number; maxR: number;
  ringColor: string; flashColor: string;
}) {
  const sparks = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <g transform={`translate(${cx} ${cy})`}>
      {/* expanding filled ring */}
      <circle r="0" fill={ringColor} opacity="0">
        <animate attributeName="r" values={`0;${maxR}`} dur="0.42s" begin={`${begin}s`} fill="freeze" />
        <animate attributeName="opacity" values="0;0.85;0" dur="0.42s" begin={`${begin}s`} fill="freeze" />
      </circle>
      {/* inner flash */}
      <circle r="0" fill={flashColor} opacity="0">
        <animate attributeName="r" values={`0;${maxR * 0.55};0`} dur="0.3s" begin={`${begin + 0.04}s`} fill="freeze" />
        <animate attributeName="opacity" values="0;1;0" dur="0.3s" begin={`${begin + 0.04}s`} fill="freeze" />
      </circle>
      {/* spark lines */}
      {sparks.map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const ex = Math.cos(rad) * maxR;
        const ey = Math.sin(rad) * maxR;
        return (
          <line
            key={angle}
            x1={ex * 0.15} y1={ey * 0.15}
            x2={ex} y2={ey}
            stroke={flashColor} strokeWidth="1.4" strokeLinecap="round" opacity="0"
          >
            <animate attributeName="opacity" values="0;0.9;0" dur="0.28s" begin={`${begin + 0.06}s`} fill="freeze" />
          </line>
        );
      })}
    </g>
  );
}

// ─── per-unit animations ───────────────────────────────────────────────────────

function SoldierAnim({ e }: { e: AttackAnimEvent }) {
  const dx = e.toX - e.fromX;
  const dy = e.toY - e.fromY;
  return (
    <Bullet fromX={e.fromX} fromY={e.fromY} dx={dx} dy={dy}
      color="#fde68a" size={2.4} travelDur={0.19} />
  );
}

function StrongSoldierAnim({ e }: { e: AttackAnimEvent }) {
  const dx = e.toX - e.fromX;
  const dy = e.toY - e.fromY;
  return (
    <g>
      <Bullet fromX={e.fromX} fromY={e.fromY} dx={dx} dy={dy}
        color="#fde68a" size={2.4} travelDur={0.17} delay={0} />
      <Bullet fromX={e.fromX} fromY={e.fromY} dx={dx} dy={dy}
        color="#fde68a" size={2} travelDur={0.17} delay={0.1} />
    </g>
  );
}

function WarriorAnim({ e }: { e: AttackAnimEvent }) {
  // Sword slash — short arc streak toward target
  const dx = e.toX - e.fromX;
  const dy = e.toY - e.fromY;
  return (
    <Bullet fromX={e.fromX} fromY={e.fromY} dx={dx} dy={dy}
      color="#e2e8f0" size={3} travelDur={0.16} />
  );
}

function MachineGunnerAnim({ e }: { e: AttackAnimEvent }) {
  const dx = e.toX - e.fromX;
  const dy = e.toY - e.fromY;
  // Last bullet arrives at delay 0.32 + travel 0.13 = 0.45s — explosion starts then
  const explosionBegin = 0.44;
  return (
    <g>
      {[0, 0.1, 0.2, 0.32].map((delay, i) => (
        <Bullet key={i} fromX={e.fromX} fromY={e.fromY} dx={dx} dy={dy}
          color="#fbbf24" size={2} travelDur={0.13} delay={delay} />
      ))}
      {e.isRanged && (
        <g transform={`translate(${e.fromX} ${e.fromY})`}>
          <Explosion cx={dx} cy={dy} begin={explosionBegin} maxR={12}
            ringColor="#f59e0b" flashColor="#fef08a" />
        </g>
      )}
    </g>
  );
}

function MortarAnim({ e }: { e: AttackAnimEvent }) {
  const dx = e.toX - e.fromX;
  const dy = e.toY - e.fromY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const arcH = Math.min(dist * 0.55, 50);
  // arc: quadratic bezier going "up" on screen (−y)
  const arcPath = `M 0 0 Q ${dx / 2} ${dy / 2 - arcH} ${dx} ${dy}`;
  const shellDur = 0.5;
  return (
    <g transform={`translate(${e.fromX} ${e.fromY})`}>
      {/* shell */}
      <circle r="3" fill="#94a3b8" opacity="0">
        <animate attributeName="opacity" values="0;0.9;0.9;0" dur={`${shellDur + 0.06}s`}
          keyTimes={`0;0.01;0.9;1`} begin="0s" fill="freeze" />
        <animateMotion path={arcPath} dur={`${shellDur}s`} begin="0s" fill="freeze" />
      </circle>
      <Explosion cx={dx} cy={dy} begin={shellDur} maxR={16} ringColor="#f97316" flashColor="#fef08a" />
    </g>
  );
}

function TankAnim({ e }: { e: AttackAnimEvent }) {
  const dx = e.toX - e.fromX;
  const dy = e.toY - e.fromY;
  const shellPath = `M 0 0 L ${dx} ${dy}`;
  const shellDur = 0.32;
  return (
    <g transform={`translate(${e.fromX} ${e.fromY})`}>
      {/* heavy shell */}
      <circle r="5" fill="#78350f" opacity="0">
        <animate attributeName="opacity" values="0;0.95;0.95;0" dur={`${shellDur + 0.06}s`}
          keyTimes="0;0.02;0.88;1" begin="0s" fill="freeze" />
        <animateMotion path={shellPath} dur={`${shellDur}s`} begin="0s" fill="freeze" />
      </circle>
      {/* muzzle flash at source */}
      <circle r="0" fill="#fef08a" opacity="0">
        <animate attributeName="r" values="0;9;0" dur="0.15s" begin="0s" fill="freeze" />
        <animate attributeName="opacity" values="0;0.8;0" dur="0.15s" begin="0s" fill="freeze" />
      </circle>
      {/* big explosion at target */}
      <Explosion cx={dx} cy={dy} begin={shellDur} maxR={22} ringColor="#f97316" flashColor="#fef08a" />
      {/* secondary smoke ring */}
      <circle r="0" fill="none" stroke="#94a3b8" strokeWidth="2" opacity="0">
        <animate attributeName="r" values={`0;${26}`} dur="0.5s" begin={`${shellDur + 0.1}s`} fill="freeze" />
        <animate attributeName="opacity" values="0;0.45;0" dur="0.5s" begin={`${shellDur + 0.1}s`} fill="freeze" />
        <animate attributeName="stroke-width" values="2;0" dur="0.5s" begin={`${shellDur + 0.1}s`} fill="freeze" />
        <animateTransform attributeName="transform" type="translate"
          values={`${dx} ${dy};${dx} ${dy}`} dur="0.5s" begin={`${shellDur + 0.1}s`} fill="freeze" />
      </circle>
    </g>
  );
}

function AircraftAnim({ e }: { e: AttackAnimEvent }) {
  const dx = e.toX - e.fromX;
  const dy = e.toY - e.fromY;
  const strikePath = `M 0 0 L ${dx} ${dy}`;
  return (
    <g transform={`translate(${e.fromX} ${e.fromY})`}>
      {/* fast streak */}
      <circle r="3.5" fill="#e0f2fe" opacity="0">
        <animate attributeName="opacity" values="0;0.92;0.92;0" dur="0.23s"
          keyTimes="0;0.02;0.88;1" begin="0s" fill="freeze" />
        <animateMotion path={strikePath} dur="0.2s" begin="0s" fill="freeze" />
      </circle>
      {/* light trail */}
      <circle r="2" fill="#bae6fd" opacity="0">
        <animate attributeName="opacity" values="0;0.6;0.6;0" dur="0.26s"
          keyTimes="0;0.02;0.88;1" begin="0.04s" fill="freeze" />
        <animateMotion path={strikePath} dur="0.2s" begin="0.04s" fill="freeze" />
      </circle>
      {/* impact flash */}
      <circle r="0" fill="#bae6fd" opacity="0" transform={`translate(${dx} ${dy})`}>
        <animate attributeName="r" values="0;14;0" dur="0.3s" begin="0.2s" fill="freeze" />
        <animate attributeName="opacity" values="0;0.75;0" dur="0.3s" begin="0.2s" fill="freeze" />
      </circle>
    </g>
  );
}

function PatriotAnim({ e }: { e: AttackAnimEvent }) {
  const dx = e.toX - e.fromX;
  const dy = e.toY - e.fromY;
  // Missile arcs up from launcher then dives down to target
  const dist = Math.sqrt(dx * dx + dy * dy);
  const arcH = Math.min(dist * 0.6, 60);
  const arcPath = `M 0 0 Q ${dx / 2} ${dy / 2 - arcH} ${dx} ${dy}`;
  const missileDur = 0.42;
  return (
    <g transform={`translate(${e.fromX} ${e.fromY})`}>
      {/* missile body */}
      <circle r="4" fill="#e2e8f0" opacity="0">
        <animate attributeName="opacity" values="0;0.95;0.95;0" dur={`${missileDur + 0.06}s`}
          keyTimes="0;0.02;0.9;1" begin="0s" fill="freeze" />
        <animateMotion path={arcPath} dur={`${missileDur}s`} begin="0s" fill="freeze" />
      </circle>
      {/* rocket exhaust trail */}
      <circle r="2" fill="#f97316" opacity="0">
        <animate attributeName="opacity" values="0;0.7;0.7;0" dur={`${missileDur + 0.06}s`}
          keyTimes="0;0.04;0.88;1" begin="0.04s" fill="freeze" />
        <animateMotion path={arcPath} dur={`${missileDur}s`} begin="0.04s" fill="freeze" />
      </circle>
      {/* large explosion — anti-air burst */}
      <Explosion cx={dx} cy={dy} begin={missileDur} maxR={20} ringColor="#38bdf8" flashColor="#e0f2fe" />
      {/* secondary ring */}
      <circle r="0" fill="none" stroke="#7dd3fc" strokeWidth="1.5" opacity="0">
        <animate attributeName="r" values={`0;28`} dur="0.4s" begin={`${missileDur + 0.08}s`} fill="freeze" />
        <animate attributeName="opacity" values="0;0.5;0" dur="0.4s" begin={`${missileDur + 0.08}s`} fill="freeze" />
        <animate attributeName="stroke-width" values="1.5;0" dur="0.4s" begin={`${missileDur + 0.08}s`} fill="freeze" />
        <animateTransform attributeName="transform" type="translate"
          values={`${dx} ${dy};${dx} ${dy}`} dur="0.4s" begin={`${missileDur + 0.08}s`} fill="freeze" />
      </circle>
    </g>
  );
}

// ─── main component ────────────────────────────────────────────────────────────

function HelicopterAnim({ e }: { e: AttackAnimEvent }) {
  // Helicopter fires a rapid burst at close range — two fast rockets, green/olive flash
  const dx = e.toX - e.fromX;
  const dy = e.toY - e.fromY;
  const path = `M 0 0 L ${dx} ${dy}`;
  const rocketDur = 0.22;
  return (
    <g transform={`translate(${e.fromX} ${e.fromY})`}>
      {/* first rocket */}
      <circle r="3" fill="#a3e635" opacity="0">
        <animate attributeName="opacity" values="0;0.9;0.9;0" dur={`${rocketDur + 0.05}s`}
          keyTimes="0;0.03;0.88;1" begin="0s" fill="freeze" />
        <animateMotion path={path} dur={`${rocketDur}s`} begin="0s" fill="freeze" />
      </circle>
      {/* second rocket staggered */}
      <circle r="2.5" fill="#bef264" opacity="0">
        <animate attributeName="opacity" values="0;0.85;0.85;0" dur={`${rocketDur + 0.05}s`}
          keyTimes="0;0.03;0.88;1" begin="0.09s" fill="freeze" />
        <animateMotion path={path} dur={`${rocketDur}s`} begin="0.09s" fill="freeze" />
      </circle>
      {/* impact burst */}
      <Explosion cx={dx} cy={dy} begin={rocketDur} maxR={14} ringColor="#84cc16" flashColor="#ecfccb" />
    </g>
  );
}

function AnimForUnit({ event: e }: { event: AttackAnimEvent }) {
  switch (e.attackerType) {
    case "basic_soldier": return <SoldierAnim e={e} />;
    case "strong_soldier": return <StrongSoldierAnim e={e} />;
    case "warrior": return <WarriorAnim e={e} />;
    case "machine_gunner": return <MachineGunnerAnim e={e} />;
    case "mortar": return <MortarAnim e={e} />;
    case "tank": return <TankAnim e={e} />;
    case "aircraft": return <AircraftAnim e={e} />;
    case "patriot": return <PatriotAnim e={e} />;
    case "attack_helicopter": return <HelicopterAnim e={e} />;
    default: return <SoldierAnim e={e} />;
  }
}

export function AttackAnimationLayer({ events }: { events: AttackAnimEvent[] }) {
  return (
    <>
      {events.map((event) => (
        <AnimForUnit key={event.id} event={event} />
      ))}
    </>
  );
}
