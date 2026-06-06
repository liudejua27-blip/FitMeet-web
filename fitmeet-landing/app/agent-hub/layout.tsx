import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent Hub — FitMeet',
  description:
    'Connect your AI Agent to FitMeet with explicit permissions, auditability, and user-controlled social matching.',
  alternates: {
    canonical: '/agent-hub',
  },
  openGraph: {
    title: 'Agent Hub — FitMeet',
    description:
      'Connect your AI Agent to FitMeet with explicit permissions, auditability, and user-controlled social matching.',
    url: '/agent-hub',
    siteName: 'FitMeet',
    type: 'website',
  },
};

export default function AgentHubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
