"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/lib/i18n/LanguageContext";

type Props = {
  onCreateGame: () => void;
  onJoinGame: () => void;
  onBack: () => void;
  /** True while the socket is still establishing its initial connection */
  connecting?: boolean;
};

export function PlayOptionsCard({ onCreateGame, onJoinGame, onBack, connecting }: Props) {
  const { t } = useTranslation();

  return (
    <Card className="w-full max-w-2xl border-slate-700/60 bg-slate-950/65 p-7 shadow-[0_0_60px_rgba(8,47,73,0.35)]">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-2xl font-bold text-white">{t.playOptions.title}</h2>
        {connecting && (
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            {t.lobby.connecting}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-300">{t.playOptions.subtitle}</p>

      <div className="mt-6 grid gap-3">
        <button
          onClick={onCreateGame}
          disabled={connecting}
          className="rounded-lg border border-cyan-500/60 bg-cyan-900/25 px-5 py-5 text-left transition hover:border-cyan-400 hover:bg-cyan-800/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="text-lg font-semibold text-cyan-100">{t.lobby.createGame}</div>
          <div className="mt-1 text-sm text-slate-300">{t.lobby.createGameDesc}</div>
        </button>

        <button
          onClick={onJoinGame}
          disabled={connecting}
          className="rounded-lg border border-slate-600/60 bg-slate-900/40 px-5 py-5 text-left transition hover:border-slate-400 hover:bg-slate-800/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="text-lg font-semibold text-slate-100">{t.lobby.joinGame}</div>
          <div className="mt-1 text-sm text-slate-400">{t.lobby.joinGameDesc}</div>
        </button>
      </div>

      <div className="mt-6">
        <Button variant="secondary" onClick={onBack}>{t.playOptions.back}</Button>
      </div>
    </Card>
  );
}
