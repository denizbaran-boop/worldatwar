"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

type Props = {
  onPlay: () => void;
};

export function PlayNow({ onPlay }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="play-now" ref={ref} className="relative w-full overflow-hidden px-4 py-36 text-center">
      {/* Tactical grid */}
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

      {/* Strong radial glow from below to create cinematic feel */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 50% 80%, rgba(6,182,212,0.10) 0%, transparent 65%)",
        }}
      />

      {/* Top divider line */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2"
        style={{ background: "linear-gradient(90deg, transparent, rgba(6,182,212,0.45), transparent)" }}
      />

      {/* Decorative corner accents */}
      <div className="pointer-events-none absolute left-8 top-8 h-8 w-8 border-l-2 border-t-2 border-cyan-500/20" />
      <div className="pointer-events-none absolute right-8 top-8 h-8 w-8 border-r-2 border-t-2 border-cyan-500/20" />
      <div className="pointer-events-none absolute bottom-8 left-8 h-8 w-8 border-b-2 border-l-2 border-cyan-500/20" />
      <div className="pointer-events-none absolute bottom-8 right-8 h-8 w-8 border-b-2 border-r-2 border-cyan-500/20" />

      <div
        className="relative mx-auto max-w-2xl"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(24px)",
          transition: "opacity 0.7s ease, transform 0.7s ease",
        }}
      >
        <p className="mb-4 text-[0.65rem] uppercase tracking-[0.4em] text-cyan-500/60">The War Begins</p>

        <h2 className="mb-3 text-5xl font-black uppercase leading-tight tracking-[0.1em] text-slate-100 md:text-6xl">
          Command
          <br />
          <span className="text-cyan-400">Your Faction</span>
        </h2>

        <div className="mx-auto my-6 h-px w-20 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />

        <p className="mx-auto mb-10 max-w-md text-base text-slate-400 md:text-lg">
          Build your army. Advance your technology. Forge alliances or break them.
          <br />
          Dominate the battlefield.
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button
            onClick={onPlay}
            className="w-full px-14 py-4 text-xl sm:w-auto"
          >
            Play Now
          </Button>
          <Button
            variant="secondary"
            onClick={() => document.getElementById("how-to-play")?.scrollIntoView({ behavior: "smooth" })}
            className="w-full px-10 py-4 text-base sm:w-auto"
          >
            How to Play
          </Button>
        </div>

        {/* Bottom tagline */}
        <p
          className="mt-12 text-[10px] uppercase tracking-[0.35em] text-slate-700"
          style={{
            opacity: visible ? 1 : 0,
            transition: "opacity 0.7s ease 0.4s",
          }}
        >
          Free to Play · No Download Required · Real-Time Multiplayer
        </p>
      </div>
    </section>
  );
}
