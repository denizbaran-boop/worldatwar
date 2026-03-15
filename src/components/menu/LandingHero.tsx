"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/lib/i18n/LanguageContext";

type Props = {
  onPlay: () => void;
  onLearnMore?: () => void;
};

const EXPLOSION_COLORS = ["#3b82f6", "#ef4444", "#a855f7", "#22c55e", "#eab308"];

type Explosion = {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
};

let _nextId = 0;

export function LandingHero({ onPlay, onLearnMore }: Props) {
  const { t } = useTranslation();
  const [explosions, setExplosions] = useState<Explosion[]>([]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const spawnExplosion = () => {
      const id = _nextId++;
      const explosion: Explosion = {
        id,
        x: 5 + Math.random() * 90,
        y: 5 + Math.random() * 90,
        color: EXPLOSION_COLORS[Math.floor(Math.random() * EXPLOSION_COLORS.length)],
        size: 80 + Math.random() * 220,
      };

      setExplosions((prev) => [...prev, explosion]);

      // Remove this explosion after its animation finishes
      setTimeout(() => {
        setExplosions((prev) => prev.filter((e) => e.id !== id));
      }, 1600);

      // Schedule the next one at a random interval
      timeoutId = setTimeout(spawnExplosion, 500 + Math.random() * 1600);
    };

    timeoutId = setTimeout(spawnExplosion, 200);
    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <>
      <style>{`
        @keyframes explosion-flash {
          0%   { opacity: 0;   transform: translate(-50%, -50%) scale(0.2); }
          8%   { opacity: 1;   transform: translate(-50%, -50%) scale(0.75); }
          20%  { opacity: 0.75; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0;   transform: translate(-50%, -50%) scale(1.5); }
        }
      `}</style>

      <Card className="relative w-full max-w-3xl overflow-hidden border-slate-700/60 bg-slate-950/65 p-10 text-center shadow-[0_0_80px_rgba(14,165,233,0.08)]">
        {/* Explosion brightening layer — sits behind all content */}
        <div className="pointer-events-none absolute inset-0">
          {explosions.map((exp) => (
            <div
              key={exp.id}
              style={{
                position: "absolute",
                left: `${exp.x}%`,
                top: `${exp.y}%`,
                width: `${exp.size}px`,
                height: `${exp.size}px`,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${exp.color}bb 0%, ${exp.color}55 35%, ${exp.color}22 60%, transparent 75%)`,
                animation: "explosion-flash 1.6s ease-out forwards",
                mixBlendMode: "screen",
              }}
            />
          ))}
        </div>

        {/* Content on top */}
        <div className="relative z-10">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">{t.landing.tagline}</p>
          <h1 className="mt-5 text-6xl font-black tracking-wide text-cyan-100 md:text-7xl">{t.landing.title}</h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-slate-300 md:text-lg">
            {t.landing.subtitle}
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button onClick={onPlay} className="w-full px-12 py-3 text-lg sm:w-auto">{t.landing.play}</Button>
            {onLearnMore && (
              <Button variant="secondary" onClick={onLearnMore} className="w-full px-8 py-3 text-base sm:w-auto">
                How to Play
              </Button>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
