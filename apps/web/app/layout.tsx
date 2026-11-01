import type { Metadata } from 'next';
import { Archivo, Archivo_Narrow, Yeseva_One } from 'next/font/google';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

// Solstice: Yeseva One for names, Archivo for reading, Archivo Narrow for the small print (apps/web/DESIGN.md).
// next/font reads these options at build time, so they must be literals.
const display = Yeseva_One({ subsets: ['latin', 'latin-ext', 'vietnamese'], weight: '400', variable: '--font-loaded-display' });
const body = Archivo({ subsets: ['latin', 'latin-ext', 'vietnamese'], variable: '--font-loaded-body' });
const small = Archivo_Narrow({ subsets: ['latin', 'latin-ext', 'vietnamese'], weight: '600', variable: '--font-loaded-small' });

export const metadata: Metadata = {
  title: 'AnGiDay',
  description: 'Quán đã lưu của nhóm',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={`${display.variable} ${body.variable} ${small.variable}`} suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
