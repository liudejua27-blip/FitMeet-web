import { SITE_URL, seo, type WebsitePage } from '../content/website-content';

export function applyWebsiteMeta(page: WebsitePage) {
  const pageSeo = seo[page];
  const canonicalUrl = `${SITE_URL}${pageSeo.path}`;

  document.title = pageSeo.title;
  setMetaTag('description', pageSeo.description);
  setMetaProperty('og:title', pageSeo.title);
  setMetaProperty('og:description', pageSeo.description);
  setMetaProperty('og:url', canonicalUrl);
  setMetaTag('twitter:title', pageSeo.title);
  setMetaTag('twitter:description', pageSeo.description);
  setCanonical(canonicalUrl);
}

function setMetaTag(name: string, content: string) {
  let tag = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.name = name;
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function setMetaProperty(property: string, content: string) {
  let tag = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('property', property);
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function setCanonical(href: string) {
  let tag = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!tag) {
    tag = document.createElement('link');
    tag.rel = 'canonical';
    document.head.appendChild(tag);
  }
  tag.href = href;
}
