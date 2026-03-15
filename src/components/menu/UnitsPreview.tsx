"use client";

import { useEffect, useRef, useState } from "react";

// ---- Data ----

type UnitData = {
  emoji: string;
  name: string;
  role: string;
  type: "Land" | "Air" | "Defense";
  description: string;
  stats: { atk: number; hp: number; rng: number };
};

const UNITS: UnitData[] = [
  {
    emoji: "🪖",
    name: "Basic Soldier",
    role: "Front Line",
    type: "Land",
    description: "The backbone of every army. Cheap to deploy, available from turn one.",
    stats: { atk: 1, hp: 2, rng: 1 },
  },
  {
    emoji: "🔫",
    name: "Machine Gunner",
    role: "Fire Support",
    type: "Land",
    description: "Suppresses enemy infantry at range. A force multiplier on open terrain.",
    stats: { atk: 3, hp: 2, rng: 2 },
  },
  {
    emoji: "💣",
    name: "Mortar",
    role: "Artillery",
    type: "Land",
    description: "Long-range area fire. Clears fortified positions from a safe distance.",
    stats: { atk: 4, hp: 3, rng: 3 },
  },
  {
    emoji: "🛡️",
    name: "Patriot",
    role: "Air Defense",
    type: "Defense",
    description: "Anti-air missile platform. Locks down airspace and protects your cities.",
    stats: { atk: 3, hp: 5, rng: 4 },
  },
  {
    emoji: "✈️",
    name: "Fighter Jet",
    role: "Air Superiority",
    type: "Air",
    description: "Blazing speed across the map. Strikes hard and repositions fast.",
    stats: { atk: 4, hp: 3, rng: 4 },
  },
  {
    emoji: "🚁",
    name: "Attack Helicopter",
    role: "Assault",
    type: "Air",
    description: "Combines air mobility with sustained firepower. Dominates mixed battles.",
    stats: { atk: 3, hp: 5, rng: 2 },
  },
];

const TYPE_STYLES: Record<string, { label: string; border: string; bg: string; text: string; glow: string }> = {
  Land:    { label: "Land",    border: "border-emerald-500/30", bg: "bg-emerald-950/40", text: "text-emerald-400", glow: "rgba(16,185,129,0.14)" },
  Air:     { label: "Air",     border: "border-sky-500/30",     bg: "bg-sky-950/40",     text: "text-sky-400",     glow: "rgba(14,165,233,0.14)" },
  Defense: { label: "Defense", border: "border-amber-500/30",   bg: "bg-amber-950/40",   text: "text-amber-400",   glow: "rgba(245,158,11,0.14)" },
};

// ---- Stat Bar ----

function StatBar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-[9px] uppercase tracking-widest text-slate-600">{label}</span>
      <div className="h-1 flex-1 rounded-full bg-slate-800/80">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-400"
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
      <span className="w-4 text-right text-xs font-semibold text-slate-400">{value}</span>
    </div>
  );
}

// ---- Unit Card ----

function UnitCard({ unit, index, visible }: { unit: UnitData; index: number; visible: boolean }) {
  const style = TYPE_STYLES[unit.type];
  return (
    <div
      style={{
        transitionDelay: `${index * 90}ms`,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(32px)",
        transition: "opacity 0.6s ease, transform 0.6s ease",
      }}
    >
      <div
        className="group relative flex h-full flex-col rounded-xl border border-slate-700/50 bg-slate-900/60 p-5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-2 hover:scale-[1.02] hover:border-slate-600/60 hover:bg-slate-800/70"
        style={{ "--hover-glow": style.glow } as React.CSSProperties}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = `0 0 32px ${style.glow}`;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = "";
        }}
      >
        {/* Header row */}
        <div className="mb-4 flex items-start justify-between">
          {/* Unit icon */}
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-lg border text-3xl ${style.border} ${style.bg}`}
          >
            {unit.emoji}
          </div>
          {/* Type badge */}
          <span
            className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${style.border} ${style.text}`}
          >
            {style.label}
          </span>
        </div>

        {/* Name + role */}
        <p className="text-[9px] uppercase tracking-[0.25em] text-slate-500">{unit.role}</p>
        <h3 className="mt-0.5 text-sm font-bold uppercase tracking-[0.15em] text-slate-100 transition-colors duration-300 group-hover:text-white">
          {unit.name}
        </h3>

        {/* Description */}
        <p className="mt-3 flex-1 text-xs leading-relaxed text-slate-400 transition-colors duration-300 group-hover:text-slate-300">
          {unit.description}
        </p>

        {/* Stats */}
        <div className="mt-4 space-y-1.5 border-t border-slate-800/80 pt-4">
          <StatBar label="ATK" value={unit.stats.atk} max={5} />
          <StatBar label="HP" value={unit.stats.hp} max={10} />
          <StatBar label="RNG" value={unit.stats.rng} max={4} />
        </div>
      </div>
    </div>
  );
}

// ---- Units Preview Section ----

export function UnitsPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
      },
      { threshold: 0.08 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="units" ref={ref} className="relative w-full overflow-hidden px-4 py-24">
      {/* Background: diagonal noise overlay for military feel */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(135deg, rgba(6,182,212,0.02) 1px, transparent 1px),
            linear-gradient(45deg, rgba(6,182,212,0.02) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 30% 50%, rgba(16,185,129,0.05) 0%, transparent 60%)" }}
      />

      {/* Top divider line */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2"
        style={{ background: "linear-gradient(90deg, transparent, rgba(6,182,212,0.4), transparent)" }}
      />

      <div className="relative mx-auto max-w-6xl">
        {/* Header */}
        <div
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(18px)",
            transition: "opacity 0.65s ease, transform 0.65s ease",
          }}
          className="mb-14 text-center"
        >
          <p className="mb-3 text-[0.65rem] uppercase tracking-[0.4em] text-cyan-500/60">Arsenal</p>
          <h2 className="text-4xl font-black uppercase tracking-[0.12em] text-slate-100 md:text-5xl">
            Units of War
          </h2>
          <div className="mx-auto mt-4 h-px w-20 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
          <p className="mx-auto mt-5 max-w-md text-sm text-slate-400 md:text-base">
            Build a diverse army. Every unit has a role on the battlefield — deploy wisely.
          </p>
        </div>

        {/* Unit cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {UNITS.map((unit, i) => (
            <UnitCard key={unit.name} unit={unit} index={i} visible={visible} />
          ))}
        </div>
      </div>
    </section>
  );
}
