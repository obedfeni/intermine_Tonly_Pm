'use client';

import { Languages } from 'lucide-react';
import { useLanguage } from './LanguageProvider';
import { Button } from './ui/button';

export function LanguageToggle() {
  const { lang, setLang, t } = useLanguage();

  return (
    <Button
      variant="outline"
      size="sm"
      aria-label={t.toggleLanguage}
      title={t.toggleLanguage}
      onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
      className="gap-1.5"
    >
      <Languages className="h-4 w-4" />
      {lang === 'en' ? '中文' : 'EN'}
    </Button>
  );
}
