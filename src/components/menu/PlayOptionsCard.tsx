"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type Props = {
  onStartGame: () => void;
  onBack: () => void;
};

export function PlayOptionsCard({ onStartGame, onBack }: Props) {
  return (
    <Card className="w-full max-w-2xl border-slate-700/60 bg-slate-950/65 p-7 shadow-[0_0_60px_rgba(8,47,73,0.35)]">
      <h2 className="text-2xl font-bold text-white">Play Options</h2>
      <p className="mt-2 text-sm text-slate-300">Choose how you want to enter the war room.</p>

      <div className="mt-6 grid gap-3">
        <button
          onClick={onStartGame}
          className="rounded-lg border border-cyan-500/60 bg-cyan-900/25 px-5 py-5 text-left transition hover:border-cyan-400 hover:bg-cyan-800/30"
        >
          <div className="text-lg font-semibold text-cyan-100">Start a Game</div>
          <div className="mt-1 text-sm text-slate-300">Create a local match with mocked commanders.</div>
        </button>

        <button
          disabled
          className="cursor-not-allowed rounded-lg border border-slate-700 bg-slate-900/55 px-5 py-5 text-left opacity-65"
        >
          <div className="flex items-center gap-2 text-lg font-semibold text-slate-200">
            Join a Game
            <span className="rounded border border-slate-600 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-300">Coming Soon</span>
          </div>
          <div className="mt-1 text-sm text-slate-400">Multiplayer session joining will be enabled in a future release.</div>
        </button>
      </div>

      <div className="mt-6">
        <Button variant="secondary" onClick={onBack}>Back</Button>
      </div>
    </Card>
  );
}
