"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/lib/i18n/LanguageContext";

type Props = {
  onJoin: (code: string) => void;
  onBack: () => void;
  error?: string;
};

export function JoinGameModal({ onJoin, onBack, error }: Props) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length === 6) onJoin(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <Card className="w-full max-w-sm border-slate-700/60 bg-slate-950/90 p-7 shadow-[0_0_60px_rgba(8,47,73,0.5)]">
        <h2 className="text-xl font-bold text-white mb-5">{t.lobby.joinGame}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-400">
              {t.lobby.enterGameCode}
            </label>
            <input
              autoFocus
              type="text"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={t.lobby.codePlaceholder}
              className="w-full rounded-lg border border-slate-600 bg-slate-800/80 px-4 py-2.5 text-center font-mono text-lg tracking-[0.3em] text-white placeholder-slate-500 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40 transition uppercase"
            />
            {error && (
              <p className="mt-2 text-sm text-rose-400">{t.lobby.gameNotFound}</p>
            )}
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={onBack} className="flex-1">
              {t.playOptions.back}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={code.trim().length !== 6}
              className="flex-1"
            >
              {t.lobby.join}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
