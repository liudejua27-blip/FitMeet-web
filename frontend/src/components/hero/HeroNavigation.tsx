import { heroCopy, type HeroLanguage } from '@/data/heroCopy';
import { LanguageToggle } from './LanguageToggle';
import { SiteLink } from '@/components/navigation/SiteLink';

type HeroNavigationProps = {
  currentLang: HeroLanguage;
  onLanguageChange: (language: HeroLanguage) => void;
};

export function HeroNavigation({ currentLang, onLanguageChange }: HeroNavigationProps) {
  const nav = heroCopy[currentLang].nav;
  const items = [
    ['#philosophy', nav.philosophy],
    ['#gateways', nav.ecosystem],
    ['#gateways', nav.gateway],
    ['#symbiosis', nav.symbiosis],
    ['/discover', nav.enter],
  ] as const;

  return (
    <header className="hero-nav">
      <nav className="hero-nav__inner" aria-label="FitMeet universe navigation">
        <a href="#top" className="hero-nav__brand" aria-label="FitMeet home">
          <span className="hero-nav__mark" aria-hidden="true">
            <img src="/favicon-192.png" alt="" width="36" height="36" />
          </span>
          <span>FitMeet</span>
        </a>
        <div className="hero-nav__links">
          {items.map(([href, label]) => (
            <SiteLink key={`${href}-${label}`} to={href}>
              {label}
            </SiteLink>
          ))}
        </div>
        <LanguageToggle currentLang={currentLang} onChange={onLanguageChange} />
      </nav>
    </header>
  );
}
