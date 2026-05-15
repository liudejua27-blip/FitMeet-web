import { siteMeta } from './siteMeta';

export type GeoPageKind = 'cityHub' | 'city' | 'sportHub' | 'sport' | 'guide' | 'brand';

export interface GeoFaq {
  question: string;
  answer: string;
}

export interface GeoActionLink {
  label: string;
  href: string;
  variant?: 'primary' | 'secondary';
}

export interface GeoDirectoryLink {
  label: string;
  href: string;
  description?: string;
  meta?: string;
}

export interface GeoDirectoryGroup {
  title: string;
  description?: string;
  links: GeoDirectoryLink[];
}

export interface GeoLandingPage {
  slug: string;
  kind: GeoPageKind;
  title: string;
  h1: string;
  description: string;
  conclusion: string;
  audience: string[];
  solves: string[];
  trust: string[];
  comparisons: string[];
  steps: string[];
  faqs: GeoFaq[];
  priority: number;
  changefreq: 'weekly' | 'monthly' | 'yearly';
  actionLinks?: GeoActionLink[];
  directoryGroups?: GeoDirectoryGroup[];
  aiSummary?: string;
}

const geoLandingPageModules = import.meta.glob<{ geoLandingPages: unknown }>(
  './geoLandingPagesData.mjs',
  { eager: true },
);

export const geoLandingPages = geoLandingPageModules['./geoLandingPagesData.mjs']
  .geoLandingPages as GeoLandingPage[];

export const normalizeGeoSlug = (slug: string) => {
  const normalized = slug.split('?')[0].replace(/\/+$/, '');
  return normalized || '/';
};

export const findGeoLandingPage = (slug: string) =>
  geoLandingPages.find((page) => page.slug === normalizeGeoSlug(slug));

export const getGeoJsonLd = (page: GeoLandingPage) => {
  const schemas: Array<Record<string, unknown>> = [
    {
      '@context': 'https://schema.org',
      '@type': page.kind === 'guide' ? 'Article' : 'WebPage',
      name: page.h1,
      headline: page.h1,
      description: page.description,
      url: `${siteMeta.url}${page.slug}`,
      inLanguage: 'zh-CN',
      isPartOf: {
        '@type': 'WebSite',
        name: siteMeta.name,
        url: siteMeta.url,
      },
      publisher: {
        '@type': 'Organization',
        name: siteMeta.name,
        url: siteMeta.url,
        logo: siteMeta.logo,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'FitMeet',
          item: siteMeta.url,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: page.h1,
          item: `${siteMeta.url}${page.slug}`,
        },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: page.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    },
  ];

  const directoryLinks = page.directoryGroups?.flatMap((group) => group.links) ?? [];
  if (directoryLinks.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `${page.h1}相关入口`,
      itemListElement: directoryLinks.map((link, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: link.label,
        url: `${siteMeta.url}${link.href}`,
      })),
    });
  }

  return schemas;
};
