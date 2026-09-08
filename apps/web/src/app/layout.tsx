import type { Metadata, Viewport } from 'next';
import { PILOT_CITY } from '@parking/config';
import { clientEnv } from '@/lib/env';
import './globals.css';

export const metadata: Metadata = {
  // Absolute base for every relative URL below and in each page's own metadata. Without it,
  // Open Graph images and canonicals resolve relative to nothing and are dropped (§7.4).
  metadataBase: new URL(clientEnv.NEXT_PUBLIC_SITE_URL),
  title: {
    default: `Parking in ${PILOT_CITY.name} | Parking Marketplace`,
    template: '%s | Parking Marketplace',
  },
  description:
    `Book guaranteed parking near where you are going in ${PILOT_CITY.name}, at a price you ` +
    'know before you leave. Or earn from a space you are not using.',
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    siteName: 'Parking Marketplace',
  },
  robots: { index: true, follow: true },
};

/*
 * Spec 7.4 requires the core loop to be fully usable at a 375px viewport, so the app is built
 * mobile-first rather than scaled down from desktop.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
