"use client";

import { useEffect, useRef, useState } from "react";

// ---- Icons ----

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 2.5C9 6 7.5 9 7.5 12s1.5 6 4.5 9.5M12 2.5C15 6 16.5 9 16.5 12s-1.5 6-4.5 9.5" />
      <path d="M2.5 12h19M4 7.5h16M4 16.5h16" />
    </svg>
  );
}

function SwordIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <path d="M14.5 17.5 3.5 6.5V3h3.5l11 11" />
      <path d="m13 19 5-5" />
      <path d="m16 16 4 4" />
      <path d="m19 21 2-2" />
    </svg>
  );
}

function HandshakeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 0C1.46 6.7 1.33 10.28 4 13l8 8 8-8c2.67-2.72 2.54-6.3.42-8.42z" />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M14.8 9A2 2 0 0 0 13 8h-2a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-2a2 2 0 0 1-1.8-1M12 7v1M12 16v1" />
    </svg>
  );
}

function TechTreeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7">
      <circle cx="12" cy="4" r="2" />
      <circle cx="5" cy="17" r="2" />
      <circle cx="12" cy="17" r="2" />
      <circle cx="19" cy="17" r="2" />
      <path d="M12 6v5M12 11 5.5 15M12 11l6.5 4M12 11v4" />
    </svg>
  );
}

// ---- Card Data ----

const CARDS = [
  {
    Icon: GlobeIcon,
    title: "Online Play",
    description:
      "Create or join online matches using a game code. Share the code with friends and battle in real-time strategy matches across the map.",
  },
  {
    Icon: SwordIcon,
    title: "Basic Gameplay",
    description:
      "Move units across the map, capture territory, and attack enemies. Control cities and protect your capital to dominate the battlefield.",
  },
  {
    Icon: HandshakeIcon,
    title: "Diplomacy",
    description:
      "Negotiate peace treaties, break alliances, or prepare for war. Diplomacy can change the balance of power instantly.",
  },
  {
    Icon: CoinIcon,
    title: "Economy & Production",
    description:
      "Use gold to produce units and strengthen your army. Control key cities to increase your income.",
  },
  {
    Icon: TechTreeIcon,
    title: "Tech Tree",
    description:
      "Unlock stronger units and advanced strategies through the tech tree. Adapt your technology to the battlefield situation.",
  },
];

// ---- Feature Card ----

type FeatureCardProps = {
  Icon: React.ComponentType;
  title: string;
  description: string;
  index: number;
  visible: boolean;
};

function FeatureCard({ Icon, title, description, index, visible }: FeatureCardProps) {
  return (
    <div
      style={{
        transitionDelay: `${index * 110}ms`,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0px)" : "translateY(28px)",
        transition: "opacity 0.65s ease, transform 0.65s ease",
      }}
    >
      <div className="group relative flex h-full flex-col gap-4 rounded-xl border border-slate-700/50 bg-slate-900/60 p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1.5 hover:scale-[1.03] hover:border-cyan-500/40 hover:bg-slate-800/70 hover:shadow-[0_0_28px_rgba(6,182,212,0.13)]">
        {/* Corner glow on hover */}
        <div
          className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(circle at 0% 0%, rgba(6,182,212,0.08) 0%, transparent 55%)",
          }}
        />

        {/* Icon container */}
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-950/50 text-cyan-400 transition-all duration-300 group-hover:border-cyan-400/50 group-hover:bg-cyan-900/30 group-hover:text-cyan-300 group-hover:shadow-[0_0_14px_rgba(6,182,212,0.22)]">
          <Icon />
        </div>

        {/* Title */}
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-200 transition-colors duration-300 group-hover:text-cyan-100">
          {title}
        </h3>

        {/* Description */}
        <p className="text-sm leading-relaxed text-slate-400 transition-colors duration-300 group-hover:text-slate-300">
          {description}
        </p>
      </div>
    </div>
  );
}

// ---- How To Play Section ----

export function HowToPlay() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.08 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="how-to-play" ref={sectionRef} className="relative w-full overflow-hidden px-4 py-24">
      {/* Tactical grid background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(6,182,212,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6,182,212,0.035) 1px, transparent 1px)
          `,
          backgroundSize: "52px 52px",
        }}
      />

      {/* Radial ambient glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 10%, rgba(6,182,212,0.07) 0%, transparent 65%)",
        }}
      />

      {/* Glowing divider line at top */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(6,182,212,0.45), transparent)",
        }}
      />

      <div className="relative mx-auto max-w-6xl">
        {/* Section header */}
        <div
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0px)" : "translateY(18px)",
            transition: "opacity 0.65s ease, transform 0.65s ease",
          }}
          className="mb-14 text-center"
        >
          <p className="mb-3 text-[0.65rem] uppercase tracking-[0.4em] text-cyan-500/60">
            Field Manual
          </p>
          <h2 className="text-4xl font-black uppercase tracking-[0.12em] text-slate-100 md:text-5xl">
            How to Play
          </h2>
          <div className="mx-auto mt-4 h-px w-20 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
          <p className="mx-auto mt-5 max-w-md text-sm text-slate-400 md:text-base">
            Learn the core mechanics and lead your faction to victory.
          </p>
        </div>

        {/* Cards grid — 1 col mobile, 2 col tablet, 5 col desktop */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {CARDS.map((card, i) => (
            <FeatureCard key={card.title} {...card} index={i} visible={visible} />
          ))}
        </div>
      </div>

      {/* Bottom fade-out gradient to next section / footer */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-24"
        style={{
          background: "linear-gradient(to bottom, transparent, rgba(7,11,22,0.6))",
        }}
      />
    </section>
  );
}
