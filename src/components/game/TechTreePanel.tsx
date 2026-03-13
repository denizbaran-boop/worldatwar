"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useGameStore } from "@/store/gameStore";

export function TechTreePanel() {
  const toggleTechTree = useGameStore((state) => state.toggleTechTree);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">Research</h3>
        <Button onClick={() => toggleTechTree(true)}>Open Tech Tree</Button>
      </div>
      <p className="mt-2 text-xs text-slate-400">Unlock stronger unit classes through the radial tree.</p>
    </Card>
  );
}
