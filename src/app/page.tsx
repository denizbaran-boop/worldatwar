"use client";

import { useRouter } from "next/navigation";
import { LandingHero } from "@/components/menu/LandingHero";
import { HowToPlay } from "@/components/menu/HowToPlay";

export default function LandingPage() {
  const router = useRouter();

  return (
    <main>
      {/* Hero — full viewport height */}
      <div className="flex min-h-screen items-center justify-center bg-map-glow px-4 py-10">
        <LandingHero onPlay={() => router.push("/setup")} />
      </div>

      {/* How To Play — scrolls naturally below the hero */}
      <HowToPlay />
    </main>
  );
}
