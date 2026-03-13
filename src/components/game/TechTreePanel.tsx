"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useGameStore } from "@/store/gameStore";
import { useTranslation } from "@/lib/i18n/LanguageContext";

export function TechTreePanel() {
  const { t } = useTranslation();
  const toggleTechTree = useGameStore((state) => state.toggleTechTree);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">{t.techPanel.title}</h3>
        <Button onClick={() => toggleTechTree(true)}>{t.techPanel.openTechTree}</Button>
      </div>
      <p className="mt-2 text-xs text-slate-400">{t.techPanel.hint}</p>
    </Card>
  );
}
