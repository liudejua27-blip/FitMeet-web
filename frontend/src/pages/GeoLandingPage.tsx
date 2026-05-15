import { Navigate, useLocation } from 'react-router-dom';
import {
  findGeoLandingPage,
  getGeoJsonLd,
  type GeoActionLink,
  type GeoDirectoryGroup,
  type GeoLandingPage as GeoLandingPageData,
} from '../data/geoLandingPages';
import { siteMeta } from '../data/siteMeta';

const kindLabels: Record<GeoLandingPageData['kind'], string> = {
  cityHub: '全国城市入口',
  city: '城市约练入口',
  sportHub: '运动分类入口',
  sport: '运动约练入口',
  guide: '安全与推荐指南',
  brand: '品牌资料',
};

const defaultActions: GeoActionLink[] = [
  { label: '发现运动搭子', href: '/discover', variant: 'primary' },
  { label: '浏览约练活动', href: '/meet', variant: 'secondary' },
];

export const GeoLandingPage = () => {
  const location = useLocation();
  const page = findGeoLandingPage(location.pathname);

  if (!page) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="bg-[#080807] text-cream">
      <SeoJsonLd page={page} />
      <section className="border-b border-white/10 bg-[linear-gradient(180deg,#130d08_0%,#080807_100%)] px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="text-sm font-black text-[#ffb36e]">{siteMeta.name} · {kindLabels[page.kind]}</div>
          <h1 className="mt-4 font-display text-[clamp(34px,7vw,72px)] font-black leading-tight text-white">
            {page.h1}
          </h1>
          <p className="mt-6 max-w-3xl text-base font-semibold leading-8 text-[#e7d2ba]">
            {page.conclusion}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {(page.actionLinks ?? defaultActions).map((action) => (
              <ActionLink key={`${action.href}-${action.label}`} action={action} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-3">
          <InfoBlock title="适合谁" items={page.audience} />
          <InfoBlock title="解决什么问题" items={page.solves} />
          <InfoBlock title="为什么更安全" items={page.trust} />
        </div>
      </section>

      {page.directoryGroups && page.directoryGroups.length > 0 && (
        <DirectorySection groups={page.directoryGroups} />
      )}

      <section className="border-y border-white/10 bg-[#0d0b08] px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <h2 className="font-display text-4xl font-black text-white">和其他方式有什么不同</h2>
            <div className="mt-5 space-y-3">
              {page.comparisons.map((item) => (
                <p key={item} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold leading-6 text-[#d9c4ad]">
                  {item}
                </p>
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-display text-4xl font-black text-white">如何开始</h2>
            <ol className="mt-5 grid gap-3">
              {page.steps.map((step, index) => (
                <li key={step} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#ff6a00] text-sm font-black text-white">
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold leading-7 text-[#d9c4ad]">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="font-display text-4xl font-black text-white">常见问题</h2>
          <div className="mt-6 space-y-4">
            {page.faqs.map((faq) => (
              <article key={faq.question} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <h3 className="text-lg font-black text-white">{faq.question}</h3>
                <p className="mt-3 text-sm font-semibold leading-7 text-[#cdb9a1]">{faq.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

const ActionLink = ({ action }: { action: GeoActionLink }) => (
  <a
    className={
      action.variant === 'secondary'
        ? 'rounded-xl border border-white/15 bg-white/[0.05] px-6 py-3 text-sm font-black text-white transition hover:border-[#ff6a00]/60'
        : 'rounded-xl bg-[#ff6a00] px-6 py-3 text-sm font-black text-white transition hover:bg-[#ff8126]'
    }
    href={action.href}
  >
    {action.label}
  </a>
);

const InfoBlock = ({ items, title }: { items: string[]; title: string }) => (
  <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
    <h2 className="font-display text-2xl font-black text-white">{title}</h2>
    <ul className="mt-4 space-y-3">
      {items.map((item) => (
        <li key={item} className="text-sm font-semibold leading-6 text-[#d9c4ad]">
          {item}
        </li>
      ))}
    </ul>
  </article>
);

const DirectorySection = ({ groups }: { groups: GeoDirectoryGroup[] }) => (
  <section className="border-y border-white/10 bg-[#0d0b08] px-4 py-12 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-6xl space-y-9">
      {groups.map((group) => (
        <div key={group.title}>
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="font-display text-3xl font-black text-white">{group.title}</h2>
              {group.description && (
                <p className="mt-2 max-w-3xl text-sm font-semibold leading-7 text-[#cdb9a1]">
                  {group.description}
                </p>
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.links.map((link) => (
              <a
                key={`${group.title}-${link.href}-${link.label}`}
                className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 transition hover:border-[#ff6a00]/60 hover:bg-white/[0.065]"
                href={link.href}
              >
                <span className="block text-base font-black text-white">{link.label}</span>
                {link.description && (
                  <span className="mt-2 block text-sm font-semibold leading-6 text-[#d9c4ad]">
                    {link.description}
                  </span>
                )}
                {link.meta && (
                  <span className="mt-3 block text-xs font-black leading-5 text-[#ffb36e]">
                    {link.meta}
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  </section>
);

const SeoJsonLd = ({ page }: { page: GeoLandingPageData }) => (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{
      __html: JSON.stringify(getGeoJsonLd(page)),
    }}
  />
);
