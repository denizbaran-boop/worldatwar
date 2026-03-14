"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslation } from "@/lib/i18n/LanguageContext";

type Props = {
  onConfirm: (name: string) => void;
  onBack: () => void;
};

export function PlayerNameModal({ onConfirm, onBack }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length > 0) onConfirm(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <Card className="w-full max-w-sm border-slate-700/60 bg-slate-950/90 p-7 shadow-[0_0_60px_rgba(8,47,73,0.5)]">
        <h2 className="text-xl font-bold text-white mb-5">{t.lobby.enterName}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            autoFocus
            type="text"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.lobby.namePlaceholder}
            className="w-full rounded-lg border border-slate-600 bg-slate-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40 transition"
          />
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={onBack} className="flex-1">
              {t.playOptions.back}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={name.trim().length === 0}
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
