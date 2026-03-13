"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { PlayOptionsCard } from "@/components/menu/PlayOptionsCard";
import { SetupPanel } from "@/components/menu/SetupPanel";
import type { PlayerColor } from "@/lib/game/types";
import { useGameStore } from "@/store/gameStore";

type SetupStep = "options" | "config";

export default function SetupPage() {
  const router = useRouter();
  const { setup, setSetup, startLocalMatch } = useGameStore(useShallow((s) => ({
    setup: s.setup,
    setSetup: s.setSetup,
    startLocalMatch: s.startLocalMatch
  })));

  const [step, setStep] = useState<SetupStep>("options");

  const onPlayerCountChange = (count: number) => {
    const safe = Math.min(5, Math.max(2, count));
    setSetup({ playerCount: safe });
  };

  const onLocalColorChange = (color: PlayerColor) => {
    setSetup({ localPlayerColor: color });
  };
  const onGameModeChange = (mode: "pvp" | "pvai") => {
    setSetup({ gameMode: mode });
  };
  const onAICountChange = (count: number) => {
    setSetup({ aiCount: count });
  };
  const onAIDifficultyChange = (difficulty: "easy" | "normal" | "hard") => {
    setSetup({ aiDifficulty: difficulty });
  };
  const onMapSizeChange = (size: "small" | "medium" | "large") => {
    setSetup({ mapSize: size });
  };

  const onStartMatch = () => {
    startLocalMatch();
    router.push("/game");
  };

  return (
    <main className="min-h-screen bg-map-glow px-4 py-10">
      <div className="mx-auto flex min-h-[88vh] max-w-6xl items-center justify-center">
        {step === "options" ? (
          <PlayOptionsCard onStartGame={() => setStep("config")} onBack={() => router.push("/")} />
        ) : (
          <SetupPanel
            playerCount={setup.playerCount}
            aiCount={setup.aiCount}
            localPlayerColor={setup.localPlayerColor}
            gameMode={setup.gameMode}
            aiDifficulty={setup.aiDifficulty}
            mapSize={setup.mapSize}
            onPlayerCountChange={onPlayerCountChange}
            onAICountChange={onAICountChange}
            onLocalColorChange={onLocalColorChange}
            onGameModeChange={onGameModeChange}
            onAIDifficultyChange={onAIDifficultyChange}
            onMapSizeChange={onMapSizeChange}
            onBack={() => setStep("options")}
            onStartMatch={onStartMatch}
          />
        )}
      </div>
    </main>
  );
}
