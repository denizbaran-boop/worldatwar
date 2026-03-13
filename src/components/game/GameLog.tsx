"use client";

import { useEffect, useRef } from "react";
import { COLOR_HEX } from "@/lib/game/constants";
import type { LogEntry, Player, PlayerColor } from "@/lib/game/types";

type Props = {
  logs: LogEntry[];
  players: Player[];
  contactedPlayerIds: string[];
  humanPlayerId: string | null;
};

export function GameLog({ logs, players, contactedPlayerIds, humanPlayerId }: Props) {
  // Colors belonging to players the human hasn't met yet
  const unknownColors = new Set<PlayerColor>(
    players
      .filter((p) => p.id !== humanPlayerId && !contactedPlayerIds.includes(p.id))
      .map((p) => p.color)
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    if (distanceFromBottom < 80) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length]);

  const grouped: { turn: number; entries: LogEntry[] }[] = [];
  for (const log of logs) {
    const last = grouped[grouped.length - 1];
    if (last && last.turn === log.turn) {
      last.entries.push(log);
    } else {
      grouped.push({ turn: log.turn, entries: [log] });
    }
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Log</p>
      <div ref={scrollContainerRef} className="mt-3 flex-1 space-y-4 overflow-auto pr-1">
        {logs.length === 0 && (
          <p className="text-xs text-slate-700">No activity yet.</p>
        )}
        {grouped.map(({ turn, entries }) => (
          <div key={turn}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                Round {turn}
              </span>
              <div className="h-px flex-1 bg-slate-800" />
            </div>
            <div className="space-y-1.5">
              {entries.map((log) => {
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
                    <span className="text-[13px] leading-snug text-slate-300">{text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
