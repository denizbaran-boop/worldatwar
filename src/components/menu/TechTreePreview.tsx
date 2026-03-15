"use client";

import { useEffect, useRef, useState } from "react";

// ---- Branch Data ----

type TechNode = {
  emoji: string;
  name: string;
  unlocked: boolean;
};

type Branch = {
  id: string;
  label: string;
  color: {
    badge: string;
    line: string;
    nodeActive: string;
    nodeActiveBg: string;
    nodeActiveBorder: string;
    nodeLockedText: string;
    nodeLockedBorder: string;
    glow: string;
  };
  nodes: TechNode[];
};

const BRANCHES: Branch[] = [
  {
    id: "land",
    label: "Land",
    color: {
      badge: "text-emerald-400",
      line: "rgba(16,185,129,0.35)",
      nodeActive: "text-emerald-300",
      nodeActiveBg: "bg-emerald-950/60",
      nodeActiveBorder: "border-emerald-500/60",
      nodeLockedText: "text-slate-500",
      nodeLockedBorder: "border-slate-700/50",
      glow: "0 0 14px rgba(16,185,129,0.25)",
    },
    nodes: [
      { emoji: "🪖", name: "Soldier", unlocked: true },
      { emoji: "⚔️", name: "Strong", unlocked: true },
      { emoji: "🔫", name: "Gunner", unlocked: false },
      { emoji: "💣", name: "Mortar", unlocked: false },
      { emoji: "🚜", name: "Tank", unlocked: false },
    ],
  },
  {
    id: "defense",
    label: "Defense",
    color: {
      badge: "text-amber-400",
      line: "rgba(245,158,11,0.35)",
      nodeActive: "text-amber-300",
      nodeActiveBg: "bg-amber-950/60",
      nodeActiveBorder: "border-amber-500/60",
      nodeLockedText: "text-slate-500",
      nodeLockedBorder: "border-slate-700/50",
      glow: "0 0 14px rgba(245,158,11,0.25)",
    },
    nodes: [
      { emoji: "🛡️", name: "Warrior", unlocked: true },
      { emoji: "🚀", name: "Patriot", unlocked: false },
    ],
  },
  {
    id: "air",
    label: "Air",
    color: {
      badge: "text-sky-400",
      line: "rgba(14,165,233,0.35)",
      nodeActive: "text-sky-300",
      nodeActiveBg: "bg-sky-950/60",
      nodeActiveBorder: "border-sky-500/60",
      nodeLockedText: "text-slate-500",
      nodeLockedBorder: "border-slate-700/50",
      glow: "0 0 14px rgba(14,165,233,0.25)",
    },
    nodes: [
      { emoji: "✈️", name: "Aircraft", unlocked: true },
      { emoji: "🚁", name: "Helicopter", unlocked: false },
    ],
  },
];

// ---- Tech Node ----

function TechNodeCard({
  node,
  branch,
  isLast,
  nodeIndex,
  visible,
  branchIndex,
}: {
  node: TechNode;
  branch: Branch;
  isLast: boolean;
  nodeIndex: number;
  visible: boolean;
  branchIndex: number;
}) {
  const delay = branchIndex * 150 + nodeIndex * 80;

  return (
    <div
      className="flex items-center"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(-16px)",
        transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ease ${delay}ms`,
      }}
    >
      {/* Node */}
      <div
        className={`group relative flex flex-col items-center gap-1.5 ${
          node.unlocked ? "cursor-default" : "cursor-default opacity-60"
        }`}
      >
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-lg border text-xl transition-all duration-300 ${
            node.unlocked
              ? `${branch.color.nodeActiveBg} ${branch.color.nodeActiveBorder}`
              : `bg-slate-900/40 ${branch.color.nodeLockedBorder}`
          }`}
          style={node.unlocked ? { boxShadow: branch.color.glow } : {}}
        >
          <span className={node.unlocked ? "" : "grayscale opacity-40"}>{node.emoji}</span>
        </div>
        <span
          className={`text-[9px] font-semibold uppercase tracking-wider ${
            node.unlocked ? branch.color.nodeActive : branch.color.nodeLockedText
          }`}
        >
          {node.name}
        </span>
        {node.unlocked && (
          <span className="text-[8px] uppercase tracking-widest text-slate-600">Unlocked</span>
        )}
      </div>

      {/* Connecting line to next node */}
      {!isLast && (
        <div className="mx-1 flex w-8 shrink-0 flex-col items-center gap-1 self-start pt-5 sm:mx-2 sm:w-10">
          <div
            className="h-px w-full"
            style={{
              background: `linear-gradient(90deg, ${branch.color.line}, rgba(51,65,85,0.4))`,
            }}
          />
          <div
            className="h-1 w-1 shrink-0 rounded-full"
            style={{ background: branch.color.line }}
          />
        </div>
      )}
    </div>
  );
}

// ---- Branch Row ----

function BranchRow({
  branch,
  index,
  visible,
}: {
  branch: Branch;
  index: number;
  visible: boolean;
}) {
  return (
    <div
      className="flex flex-col gap-4 rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 backdrop-blur-sm sm:flex-row sm:items-start sm:gap-0"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 0.6s ease ${index * 120}ms, transform 0.6s ease ${index * 120}ms`,
      }}
    >
      {/* Branch label */}
      <div className="flex w-20 shrink-0 flex-row items-center gap-2 sm:flex-col sm:items-center sm:pt-3">
        <span
          className={`text-[10px] font-black uppercase tracking-[0.25em] ${branch.color.badge}`}
        >
          {branch.label}
        </span>
        <div
          className="h-px flex-1 sm:h-6 sm:w-px sm:flex-none"
          style={{ background: `linear-gradient(to right, ${branch.color.line}, transparent)` }}
        />
      </div>

      {/* Nodes row — scrollable horizontally on mobile */}
      <div className="flex flex-wrap items-start gap-y-4 overflow-x-auto pb-1">
        {branch.nodes.map((node, ni) => (
          <TechNodeCard
            key={node.name}
            node={node}
            branch={branch}
            isLast={ni === branch.nodes.length - 1}
            nodeIndex={ni}
            visible={visible}
            branchIndex={index}
          />
        ))}
      </div>
    </div>
  );
}

// ---- Tech Tree Preview Section ----

export function TechTreePreview() {
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
    <section id="tech-tree" ref={ref} className="relative w-full overflow-hidden px-4 py-24">
      {/* Background grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(6,182,212,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6,182,212,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "52px 52px",
        }}
      />
      {/* Ambient glow right side */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 70% 50%, rgba(245,158,11,0.04) 0%, transparent 60%)",
        }}
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
          <p className="mb-3 text-[0.65rem] uppercase tracking-[0.4em] text-cyan-500/60">Progression</p>
          <h2 className="text-4xl font-black uppercase tracking-[0.12em] text-slate-100 md:text-5xl">
            Technology Tree
          </h2>
          <div className="mx-auto mt-4 h-px w-20 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
          <p className="mx-auto mt-5 max-w-md text-sm text-slate-400 md:text-base">
            Research new units across three military branches. Choose your path and advance your war machine.
          </p>
        </div>

        {/* Branch rows */}
        <div className="flex flex-col gap-4">
          {BRANCHES.map((branch, i) => (
            <BranchRow key={branch.id} branch={branch} index={i} visible={visible} />
          ))}
        </div>

        {/* Bottom legend */}
        <div
          style={{
            opacity: visible ? 1 : 0,
            transition: "opacity 0.65s ease 0.5s",
          }}
          className="mt-8 flex items-center justify-center gap-6 text-[10px] uppercase tracking-widest text-slate-600"
        >
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-cyan-500/60" /> Unlocked
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-slate-700" /> Requires Research
          </span>
        </div>
      </div>
    </section>
  );
}
