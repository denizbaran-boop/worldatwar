"use client";

import { useRouter } from "next/navigation";
import { LandingHero } from "@/components/menu/LandingHero";

export default function LandingPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-map-glow px-4 py-10">
      <div className="mx-auto flex min-h-[88vh] max-w-6xl items-center justify-center">
        <LandingHero onPlay={() => router.push("/setup")} />
      </div>
    </main>
  );
}
