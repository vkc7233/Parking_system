import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Parking Marketplace',
    template: '%s | Parking Marketplace',
  },
  description: 'Book guaranteed parking near your destination, or earn from your unused space.',
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
