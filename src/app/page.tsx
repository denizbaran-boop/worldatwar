"use client";

import { useRouter } from "next/navigation";
import { LandingHero } from "@/components/menu/LandingHero";
import { HowToPlay } from "@/components/menu/HowToPlay";
import { UnitsPreview } from "@/components/menu/UnitsPreview";
import { TechTreePreview } from "@/components/menu/TechTreePreview";
import { PlayNow } from "@/components/menu/PlayNow";

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

export default function LandingPage() {
  const router = useRouter();

  return (
    <main>
      {/* 1 — Hero (full viewport) */}
      <section className="relative flex min-h-screen flex-col items-center justify-center bg-map-glow px-4 py-10">
        <LandingHero
          onPlay={() => router.push("/setup")}
          onLearnMore={() => scrollTo("how-to-play")}
        />

        {/* Scroll indicator */}
        <div className="absolute bottom-8 flex flex-col items-center gap-2 opacity-40">
          <span className="text-[9px] uppercase tracking-[0.35em] text-slate-400">Scroll</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-4 w-4 animate-bounce text-slate-400"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>

        {/* Smooth gradient fade into next section */}
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-32"
          style={{ background: "linear-gradient(to bottom, transparent, #070b16)" }}
        />
      </section>

      {/* 2 — How to Play */}
      <HowToPlay />

      {/* 3 — Units of War */}
      <UnitsPreview />

      {/* 4 — Technology Tree */}
      <TechTreePreview />

      {/* 5 — Play Now CTA */}
      <PlayNow onPlay={() => router.push("/setup")} />
    </main>
  );
}
