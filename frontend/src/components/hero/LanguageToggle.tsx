import type { HeroLanguage } from '@/data/heroCopy';

type LanguageToggleProps = {
  currentLang: HeroLanguage;
  onChange: (language: HeroLanguage) => void;
};

export function LanguageToggle({ currentLang, onChange }: LanguageToggleProps) {
  return (
    <div className="language-toggle" aria-label="Language selector">
      {(['zh', 'en'] as const).map((language) => (
        <button
          key={language}
          type="button"
          className={currentLang === language ? 'is-active' : undefined}
          onClick={() => onChange(language)}
          aria-pressed={currentLang === language}
        >
          {language === 'zh' ? '中文' : 'EN'}
        </button>
      ))}
    </div>
  );
}
