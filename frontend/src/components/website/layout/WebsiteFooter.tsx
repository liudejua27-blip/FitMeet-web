import { Link } from 'react-router-dom';
import { SiteLink } from '../../navigation/SiteLink';
import { footerColumns, footerContactEmail, ICP_TEXT, ICP_URL } from '../content/website-content';

export function WebsiteFooter() {
  return (
    <footer className="fm-footer">
      <div className="fm-footer__brand">
        <strong>
          <img src="/favicon-192.png" alt="FitMeet" width="30" height="30" />
          FitMeet
        </strong>
        <p>需求流社交，从一个明确需求开始，遇见真正合适的人。</p>
      </div>
      <nav className="fm-footer__grid" aria-label="FitMeet 页脚导航">
        {footerColumns.map((column) => (
          <section key={column.title} aria-labelledby={`footer-${column.title}`}>
            <h2 id={`footer-${column.title}`}>{column.title}</h2>
            {column.links.map((link) =>
              link.to.startsWith('/discover') ? (
                <SiteLink key={link.to} to={link.to}>
                  {link.label}
                </SiteLink>
              ) : (
                <Link key={link.to} to={link.to}>
                  {link.label}
                </Link>
              ),
            )}
          </section>
        ))}
        <section aria-labelledby="footer-contact">
          <h2 id="footer-contact">联系</h2>
          <a href={`mailto:${footerContactEmail}`}>{footerContactEmail}</a>
          <a href={ICP_URL} target="_blank" rel="noreferrer">
            {ICP_TEXT}
          </a>
          <span>© {new Date().getFullYear()} FitMeet</span>
        </section>
      </nav>
    </footer>
  );
}
