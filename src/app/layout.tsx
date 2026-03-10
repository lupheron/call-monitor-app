import type { Metadata } from 'next';
import { Syne, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';
import { GlobalProvider } from '@/components/GlobalContext';

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Call Monitor Dashboard',
  description: 'RingCentral Call Monitoring Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${syne.variable} ${ibmPlexMono.variable}`}>
        <Providers>
          <GlobalProvider>{children}</GlobalProvider>
        </Providers>
        <div className="glow-orb top-left" />
        <div className="glow-orb bottom-right" />
      </body>
    </html>
  );
}
