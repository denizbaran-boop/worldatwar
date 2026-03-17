"use client";

import { useEffect, useRef } from "react";
import { COLOR_HEX } from "@/lib/game/constants";
import type { LogEntry, Player, PlayerColor } from "@/lib/game/types";
import { useTranslation } from "@/lib/i18n/LanguageContext";

type Props = {
  logs: LogEntry[];
  players: Player[];
  contactedPlayerIds: string[];
  humanPlayerId: string | null;
  currentTurn: number;
};

export function GameLog({ logs, players, contactedPlayerIds, humanPlayerId, currentTurn }: Props) {
  const { t } = useTranslation();
  // Colors belonging to players the human hasn't met yet
  const unknownColors = new Set<PlayerColor>(
    players
      .filter((p) => p.id !== humanPlayerId && !contactedPlayerIds.includes(p.id))
      .map((p) => p.color)
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Only show entries for the current round
  const currentRoundLogs = logs.filter((log) => log.turn === currentTurn);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentRoundLogs.length]);

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{t.log.round} {currentTurn}</p>
        <div className="h-px flex-1 bg-slate-800" />
      </div>
      <div ref={scrollContainerRef} className="flex-1 space-y-1.5 overflow-auto pr-1">
        {currentRoundLogs.length === 0 && (
          <p className="text-xs text-slate-700">{t.log.noActivity}</p>
        )}
        {currentRoundLogs.map((log) => {
          const isUnknown = log.color != null && unknownColors.has(log.color);
          // Mask any color name that belongs to an unknown player
          let text = log.text;
          if (isUnknown && log.color) {
            text = text.replace(new RegExp(`\\b${log.color}\\b`, "gi"), "???");
          }
          return (
            <div key={log.id} className="flex items-start gap-2.5">
              <span
                className="mt-[5px] h-1.5 w-1.5 flex-shrink-0 rounded-full"
                style={{
                  backgroundColor: isUnknown ? "#475569" : log.color ? COLOR_HEX[log.color] : "#334155"
                }}
              />
              <span className={`text-[13px] leading-snug ${isUnknown ? "text-slate-500" : "text-slate-300"}`}>{text}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
