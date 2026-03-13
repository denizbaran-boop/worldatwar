import { COLOR_HEX } from "@/lib/game/constants";
import type { Player } from "@/lib/game/types";
import { Card } from "@/components/ui/Card";

type Props = {
  currentPlayer: Player | null;
  aiThinking?: boolean;
};

export function TurnBanner({ currentPlayer, aiThinking = false }: Props) {
  return (
    <Card className="p-4">
      <div className="text-sm uppercase tracking-wide text-slate-400">Active Commander</div>
      {currentPlayer && (
        <div className="mt-2 flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: COLOR_HEX[currentPlayer.color], boxShadow: `0 0 10px ${COLOR_HEX[currentPlayer.color]}` }}
          />
          <span className="text-base font-semibold text-slate-100 capitalize">{currentPlayer.color}</span>
          {aiThinking && <span className="text-xs uppercase tracking-wide text-cyan-300">AI Thinking...</span>}
        </div>
      )}
    </Card>
  );
}
