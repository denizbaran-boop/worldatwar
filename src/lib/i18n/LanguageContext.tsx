"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { LANGUAGES, Language, Translations, translations } from "./translations";

const STORAGE_KEY = "worldatwar_lang";

type LanguageContextValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: Translations;
};

const LanguageContext = createContext<LanguageContextValue>({
  lang: "en",
  setLang: () => {},
  t: translations.en,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");
  const [mounted, setMounted] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored && stored in translations) {
      setLangState(stored);
    }
    setMounted(true);
  }, []);

  const setLang = (next: Language) => {
    setLangState(next);
    localStorage.setItem(STORAGE_KEY, next);
    setSelectorOpen(false);
  };

  const t = translations[lang];
  const current = LANGUAGES.find((l) => l.code === lang)!;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}

      {/* Language selector — fixed top-left */}
      {mounted && (
        <div className="fixed left-4 top-4 z-[100]">
          <button
            onClick={() => setSelectorOpen((prev) => !prev)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/70 bg-slate-900/90 px-2.5 py-1.5 text-sm text-slate-300 shadow-lg backdrop-blur transition hover:border-slate-500 hover:text-white"
            title="Change language"
          >
            <span>{current.flag}</span>
            <span className="text-xs font-medium">{current.code.toUpperCase()}</span>
            <svg
              className={`h-3 w-3 transition-transform ${selectorOpen ? "rotate-180" : ""}`}
              viewBox="0 0 12 12"
              fill="none"
            >
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {selectorOpen && (
            <>
              {/* backdrop to close */}
              <div className="fixed inset-0 z-[-1]" onClick={() => setSelectorOpen(false)} />
              <div className="absolute left-0 top-full mt-1 rounded-lg border border-slate-700/70 bg-slate-900/95 py-1 shadow-xl backdrop-blur-sm">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => setLang(l.code)}
                    className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition hover:bg-slate-800 ${
                      l.code === lang ? "text-cyan-300" : "text-slate-300"
                    }`}
                  >
                    <span>{l.flag}</span>
                    <span>{l.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Footer — fixed bottom-left */}
      {mounted && (
        <div className="fixed bottom-3 left-4 z-[99] max-w-[min(calc(100vw-2rem),640px)]">
          <p className="text-[11px] leading-relaxed text-slate-500/80 select-none">
            {t.footer.text}
          </p>
        </div>
      )}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}
