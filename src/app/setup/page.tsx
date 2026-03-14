"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { PlayOptionsCard } from "@/components/menu/PlayOptionsCard";
import { SetupPanel } from "@/components/menu/SetupPanel";
import { PlayerNameModal } from "@/components/game/PlayerNameModal";
import { JoinGameModal } from "@/components/game/JoinGameModal";
import { LobbyScreen } from "@/components/game/LobbyScreen";
import type { PlayerColor } from "@/lib/game/types";
import { useGameStore } from "@/store/gameStore";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  kickPlayer,
  generatePlayerId,
  type GameRoom,
} from "@/lib/game/gameRoomManager";

type SetupStep = "options" | "name" | "join" | "lobby" | "config";
type PendingAction = "create" | "join";

export default function SetupPage() {
  const router = useRouter();
  const { setup, setSetup, startLocalMatch } = useGameStore(
    useShallow((s) => ({
      setup: s.setup,
      setSetup: s.setSetup,
      startLocalMatch: s.startLocalMatch,
    }))
  );

  const [step, setStep] = useState<SetupStep>("options");
  const [pendingAction, setPendingAction] = useState<PendingAction>("create");
  const [joinError, setJoinError] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<GameRoom | null>(null);

  // Generate a stable player ID for this browser session
  const localPlayerIdRef = useRef<string>(generatePlayerId());
  const localPlayerId = localPlayerIdRef.current;

  // ── Setup config handlers (unchanged) ──────────────────────────────────────
  const onPlayerCountChange = (count: number) => {
    setSetup({ playerCount: Math.min(5, Math.max(2, count)) });
  };
  const onLocalColorChange = (color: PlayerColor) => setSetup({ localPlayerColor: color });
  const onGameModeChange = (mode: "pvp" | "pvai") => setSetup({ gameMode: mode });
  const onAICountChange = (count: number) => setSetup({ aiCount: count });
  const onAIDifficultyChange = (difficulty: "easy" | "normal" | "hard") =>
    setSetup({ aiDifficulty: difficulty });
  const onMapSizeChange = (size: "small" | "medium" | "large") => setSetup({ mapSize: size });

  const onStartMatch = () => {
    startLocalMatch();
    router.push("/game");
  };

  // ── Lobby flow handlers ─────────────────────────────────────────────────────
  const handleNameConfirm = (name: string) => {
    if (pendingAction === "create") {
      const room = createRoom(localPlayerId, name);
      setCurrentRoom(room);
      setStep("lobby");
    } else {
      // Store name temporarily then show code input
      // We'll pass the name along when the code is submitted
      sessionStorage.setItem("lobby_pending_name", name);
      setStep("join");
    }
  };

  const handleJoinCode = (code: string) => {
    const name = sessionStorage.getItem("lobby_pending_name") ?? "Commander";
    const room = joinRoom(code, localPlayerId, name);
    if (!room) {
      setJoinError(true);
      return;
    }
    setJoinError(false);
    setCurrentRoom(room);
    // Pre-configure player count to match lobby size
    setSetup({ playerCount: Math.min(5, Math.max(2, room.players.length)) });
    setStep("lobby");
  };

  const handleLeave = () => {
    if (currentRoom) {
      leaveRoom(currentRoom.code, localPlayerId);
      setCurrentRoom(null);
    }
    setStep("options");
  };

  const handleKick = (targetId: string) => {
    if (!currentRoom) return;
    const updated = kickPlayer(currentRoom.code, localPlayerId, targetId);
    if (updated) setCurrentRoom(updated);
  };

  const handleStartGame = () => {
    if (!currentRoom) return;
    // Set player count to match lobby (capped at game limits)
    const count = Math.min(5, Math.max(2, currentRoom.players.length));
    setSetup({ playerCount: count });
    setStep("config");
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-map-glow px-4 py-10">
      <div className="mx-auto flex min-h-[88vh] max-w-6xl items-center justify-center">
        {step === "options" && (
          <PlayOptionsCard
            onCreateGame={() => {
              setPendingAction("create");
              setStep("name");
            }}
            onJoinGame={() => {
              setPendingAction("join");
              setStep("name");
            }}
            onBack={() => router.push("/")}
          />
        )}

        {step === "config" && (
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
            onBack={() => setStep(currentRoom ? "lobby" : "options")}
            onStartMatch={onStartMatch}
          />
        )}
      </div>

      {/* Modals rendered above the page content */}
      {step === "name" && (
        <PlayerNameModal
          onConfirm={handleNameConfirm}
          onBack={() => setStep("options")}
        />
      )}

      {step === "join" && (
        <JoinGameModal
          onJoin={handleJoinCode}
          onBack={() => setStep("name")}
          error={joinError ? "not-found" : undefined}
        />
      )}

      {step === "lobby" && currentRoom && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <LobbyScreen
            room={currentRoom}
            localPlayerId={localPlayerId}
            onStartGame={handleStartGame}
            onLeave={handleLeave}
            onKick={handleKick}
          />
        </div>
      )}
    </main>
  );
}
