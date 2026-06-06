import type { Metadata } from 'next';
import './globals.css';
import { SmoothScroll } from '@/components/SmoothScroll';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

export const metadata: Metadata = {
  title: 'FitMeet — One Earth. Every body. Every being.',
  description:
    'FitMeet — a connected wellness ecosystem for humans, pets, animals, robotics, and virtual AI.',
  metadataBase: new URL('https://www.ourfitmeet.cn'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'FitMeet',
    description:
      'A connected wellness ecosystem for humans, pets, animals, robotics, and virtual AI.',
    url: '/',
    siteName: 'FitMeet',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://rsms.me/" />
        <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
      </head>
      <body className="font-sans antialiased bg-charcoal text-ivory">
        <SmoothScroll />
        <Navbar />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
