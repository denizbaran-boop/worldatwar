"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { PlayOptionsCard } from "@/components/menu/PlayOptionsCard";
import { SetupPanel } from "@/components/menu/SetupPanel";
import { PlayerNameModal } from "@/components/game/PlayerNameModal";
import { JoinGameModal } from "@/components/game/JoinGameModal";
import { LobbyScreen } from "@/components/game/LobbyScreen";
import type { PlayerColor } from "@/lib/game/types";
import { useGameStore } from "@/store/gameStore";
import { useRoom } from "@/lib/multiplayer/useRoom";

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

  const [step, setStep]                     = useState<SetupStep>("options");
  const [pendingAction, setPendingAction]   = useState<PendingAction>("create");
  const [pendingName, setPendingName]       = useState("");

  // ── Multiplayer room hook ──────────────────────────────────────────────────
  const {
    connected,
    connecting,
    room,
    error,
    wasKicked,
    localPlayerId,
    createRoom: socketCreate,
    joinRoom:   socketJoin,
    leaveRoom:  socketLeave,
    kickPlayer: socketKick,
    startGame:  socketStart,
    clearError,
    clearKicked,
    setLocalPlayerName,
  } = useRoom();

  // ── React to room events ──────────────────────────────────────────────────

  // Room appears → enter lobby
  useEffect(() => {
    if (room && step !== "lobby" && step !== "config") {
      setStep("lobby");
    }
  }, [room, step]);

  // Room status becomes "setup" → all clients navigate to config together
  useEffect(() => {
    if (room?.status === "setup") {
      const count = Math.min(5, Math.max(2, room.players.length));
      setSetup({ playerCount: count });
      setStep("config");
    }
  }, [room?.status, room?.players.length, setSetup]);

  // Kicked → return to options
  useEffect(() => {
    if (wasKicked) {
      setStep("options");
      clearKicked();
    }
  }, [wasKicked, clearKicked]);

  // ── Setup config handlers (unchanged from before) ─────────────────────────
  const onPlayerCountChange = (count: number) =>
    setSetup({ playerCount: Math.min(5, Math.max(2, count)) });
  const onLocalColorChange  = (color: PlayerColor) => setSetup({ localPlayerColor: color });
  const onGameModeChange    = (mode: "pvp" | "pvai") => setSetup({ gameMode: mode });
  const onAICountChange     = (count: number) => setSetup({ aiCount: count });
  const onAIDifficultyChange = (d: "easy" | "normal" | "hard") => setSetup({ aiDifficulty: d });
  const onMapSizeChange     = (size: "small" | "medium" | "large") => setSetup({ mapSize: size });

  const onStartMatch = () => {
    startLocalMatch();
    router.push("/game");
  };

  // ── Lobby flow handlers ───────────────────────────────────────────────────

  const handleNameConfirm = (name: string) => {
    setPendingName(name);
    setLocalPlayerName(name);
    if (pendingAction === "create") {
      socketCreate(name);
      // room:created event will trigger the useEffect → lobby step
    } else {
      setStep("join");
    }
  };

  const handleJoinCode = (code: string) => {
    clearError();
    socketJoin(code, pendingName);
    // room:joined → useEffect → lobby  /  room:error → error state stays
  };

  const handleLeave = () => {
    socketLeave();
    setStep("options");
  };

  const handleKick = (targetId: string) => {
    socketKick(targetId);
  };

  const handleStartGame = () => {
    socketStart();
    // room:started → room.status = "setup" → useEffect transitions all clients
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-map-glow px-4 py-10">
      <div className="mx-auto flex min-h-[88vh] max-w-6xl items-center justify-center">

        {step === "options" && (
          <PlayOptionsCard
            onCreateGame={() => { setPendingAction("create"); setStep("name"); }}
            onJoinGame={()   => { setPendingAction("join");   setStep("name"); }}
            onBack={() => router.push("/")}
            connecting={connecting}
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
            onBack={() => setStep(room ? "lobby" : "options")}
            onStartMatch={onStartMatch}
          />
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

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
          error={error}
        />
      )}

      {step === "lobby" && room && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <LobbyScreen
            room={room}
            localPlayerId={localPlayerId}
            connected={connected}
            onStartGame={handleStartGame}
            onLeave={handleLeave}
            onKick={handleKick}
          />
        </div>
      )}
    </main>
  );
}
