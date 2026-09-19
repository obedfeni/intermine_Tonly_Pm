import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/ThemeProvider';
import { LanguageProvider } from '@/components/LanguageProvider';

// Deliberately using the system font stack (see tailwind.config.ts) instead
// of next/font/google — zero external font fetch at build or request time,
// which means one less network dependency for your Vercel build to trip on.

export const metadata: Metadata = {
  title: 'Fleet PM Predictor',
  description: 'Predictive preventive maintenance for EV truck fleets, powered by robust ML odometer-trend regression.',
};

// The dashboard has nothing worth pre-rendering at build time — it's 100%
// client-fetched (the page loads its data on mount) and single-user, so
// there's no SEO/first-paint benefit to static generation. Forcing dynamic
// rendering here (a Server Component file — route segment config exports
// like this one are only honored from a Server Component, not a 'use
// client' page.tsx) skips Next's build-time "Generating static pages" pass
// for "/" entirely, which sidesteps a class of build-cache bug where a
// stale/restored Turbopack cache can produce a mismatched Context module
// instance between deployments — symptom: "useX must be used within
// XProvider" thrown during prerendering, even though the provider tree
// (below) is correctly wired.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <LanguageProvider>
            {children}
            <Toaster richColors position="top-right" />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
