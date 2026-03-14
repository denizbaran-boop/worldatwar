"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import type { GameRoom } from "@/lib/game/gameRoomManager";

type Props = {
  room: GameRoom;
  localPlayerId: string;
  onStartGame: () => void;
  onLeave: () => void;
  onKick: (targetId: string) => void;
};

export function LobbyScreen({ room, localPlayerId, onStartGame, onLeave, onKick }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const isHost = room.hostId === localPlayerId;

  const handleCopy = () => {
    navigator.clipboard.writeText(room.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <Card className="w-full max-w-2xl border-slate-700/60 bg-slate-950/65 p-7 shadow-[0_0_60px_rgba(8,47,73,0.35)]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-1">
            {t.lobby.gameCode}
          </p>
          <div className="flex items-center gap-3">
            <span className="font-mono text-3xl font-bold tracking-[0.2em] text-cyan-300">
              {room.code}
            </span>
            <button
              onClick={handleCopy}
              className={`rounded-md border px-3 py-1 text-xs font-semibold transition ${
                copied
                  ? "border-green-500/60 bg-green-900/30 text-green-300"
                  : "border-slate-600 bg-slate-800/70 text-slate-300 hover:border-slate-400 hover:text-white"
              }`}
            >
              {copied ? t.lobby.codeCopied : t.lobby.copyCode}
            </button>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-1">
            {t.lobby.playerList}
          </p>
          <p className="text-sm font-semibold text-slate-200">
            {room.players.length} / {room.maxPlayers} {t.lobby.players}
          </p>
        </div>
      </div>

      {/* Player list */}
      <div className="mb-6 rounded-lg border border-slate-700/50 bg-slate-900/50 overflow-hidden">
        {room.players.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">{t.lobby.waitingForPlayers}</p>
        ) : (
          <ul className="divide-y divide-slate-700/40">
            {room.players.map((player) => (
              <li key={player.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      player.isHost ? "bg-cyan-400" : "bg-slate-500"
                    }`}
                  />
                  <span className="text-sm font-medium text-slate-100">{player.name}</span>
                  {player.isHost && (
                    <span className="rounded border border-cyan-600/50 bg-cyan-900/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
                      {t.lobby.host}
                    </span>
                  )}
                  {player.id === localPlayerId && !player.isHost && (
                    <span className="rounded border border-slate-600/50 bg-slate-800/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      You
                    </span>
                  )}
                </div>
                {isHost && player.id !== localPlayerId && (
                  <button
                    onClick={() => onKick(player.id)}
                    className="rounded border border-rose-700/50 bg-rose-900/20 px-2 py-0.5 text-xs font-semibold text-rose-400 transition hover:bg-rose-800/30 hover:text-rose-300"
                  >
                    {t.lobby.kick}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Waiting hint for non-host */}
      {!isHost && (
        <p className="mb-5 text-sm text-slate-400 text-center">{t.lobby.waitingForPlayers}</p>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onLeave} className="flex-1">
          {t.lobby.leaveLobby}
        </Button>
        {isHost && (
          <Button
            variant="primary"
            onClick={onStartGame}
            disabled={room.players.length < 1}
            className="flex-1"
          >
            {t.lobby.startGame}
          </Button>
        )}
      </div>
    </Card>
  );
}
