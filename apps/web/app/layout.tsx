import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

// Placeholder face until the Hallmark pass picks the real ones (S4 Task 5); the token layer names it.
const body = Geist({ subsets: ['latin', 'latin-ext', 'vietnamese'], variable: '--font-loaded-body' });
const display = Geist({ subsets: ['latin', 'latin-ext', 'vietnamese'], variable: '--font-loaded-display' });

export const metadata: Metadata = {
  title: 'AnGiDay',
  description: 'Quán đã lưu của nhóm',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={`${body.variable} ${display.variable}`} suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
