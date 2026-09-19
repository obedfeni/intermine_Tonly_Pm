'use client';

import * as React from 'react';
import { translations, type Lang, type Translation } from '@/lib/i18n';

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translation;
}

const LanguageContext = React.createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>('en');

  React.useEffect(() => {
    // Reading localStorage (an external system) after mount, to avoid an
    // SSR/CSR markup mismatch — same pattern as ThemeProvider.
    const stored = localStorage.getItem('lang');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored === 'en' || stored === 'zh') setLangState(stored);
  }, []);

  const setLang = React.useCallback((l: Lang) => {
    localStorage.setItem('lang', l);
    setLangState(l);
  }, []);

  const value = React.useMemo(() => ({ lang, setLang, t: translations[lang] }), [lang, setLang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = React.useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
