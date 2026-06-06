const FOOTER_LINK_GROUPS = [
  {
    title: 'Ecosystem',
    links: [
      { label: 'Human', href: '/human' },
      { label: 'Pet & Animal', href: '/pet' },
      { label: 'AI & Robotics', href: '/ai' },
    ],
  },
  {
    title: 'Brand',
    links: [
      { label: 'About', href: '#philosophy' },
      { label: 'Contact', href: 'mailto:hello@ourfitmeet.cn' },
      { label: 'Press', href: 'mailto:press@ourfitmeet.cn' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: 'mailto:privacy@ourfitmeet.cn' },
      { label: 'Terms', href: 'mailto:legal@ourfitmeet.cn' },
      { label: 'Cookies', href: 'mailto:privacy@ourfitmeet.cn?subject=Cookies' },
    ],
  },
  {
    title: 'Product',
    links: [
      { label: 'Agent Hub', href: '/agent-hub' },
      { label: 'Ecosystem', href: '#gateways' },
      { label: 'Email', href: 'mailto:hello@ourfitmeet.cn' },
    ],
  },
] as const;

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer
      id="footer"
      className="relative px-6 md:px-10 pt-20 pb-10 border-t hairline text-ivory/55 text-[13px]"
    >
      <div className="max-w-[1440px] mx-auto grid md:grid-cols-12 gap-10">
        <div className="md:col-span-4">
          <p className="text-ivory tracking-ultra text-xl font-medium">FitMeet</p>
          <p className="mt-4 max-w-sm leading-relaxed">
            One Earth. Every body. Every being. A connected wellness ecosystem.
          </p>
        </div>

        {FOOTER_LINK_GROUPS.map((group) => (
          <div key={group.title} className="md:col-span-2">
            <p className="text-[10px] tracking-[0.28em] uppercase text-ivory/35 mb-4">
              {group.title}
            </p>
            <ul className="space-y-2">
              {group.links.map((link) => (
                <li key={`${group.title}-${link.label}`}>
                  <a
                    href={link.href}
                    className="hover:text-ivory transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="max-w-[1440px] mx-auto mt-16 pt-6 border-t hairline flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-ivory/35 text-[11px] tracking-[0.18em] uppercase">
        <span>© {year} FitMeet. All rights reserved.</span>
        <span>Designed for a connected wellness ecosystem.</span>
      </div>
    </footer>
  );
}
