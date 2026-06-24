import { useEffect } from 'react';
import { AgentWorkspace } from '../components/agent-workspace/AgentWorkspace';

export function AgentWorkspacePage({
  view = 'home',
}: {
  view?: 'home' | 'chat' | 'settings' | 'projects' | 'history';
}) {
  useEffect(() => {
    const title = 'FitMeet Agent - 全球社交 AI 助手';
    const description =
      'FitMeet Agent 帮你用自然对话开启全球社交，整理个人信息、权限边界、候选匹配和线下见面确认。';
    const canonical = 'https://www.ourfitmeet.cn/agent';
    document.title = title;
    setMetaTag('description', description);
    setMetaTag(
      'keywords',
      'FitMeet Agent,AI社交助手,全球社交,找搭子,个人信息,线下见面确认',
    );
    setMetaProperty('og:title', title);
    setMetaProperty('og:description', description);
    setMetaProperty('og:url', canonical);
    setMetaProperty('og:type', 'website');
    setMetaTag('twitter:title', title);
    setMetaTag('twitter:description', description);
    setCanonical(canonical);
  }, []);

  return <AgentWorkspace view={view} />;
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
