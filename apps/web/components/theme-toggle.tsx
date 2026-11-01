'use client';

import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';

const NEXT_THEME = { light: 'dark', dark: 'system', system: 'light' } as const;
const subscribe = () => () => {};
const LABELS = { light: 'Sáng', dark: 'Tối', system: 'Theo máy' } as const;

/** Cycles light → dark → system. Renders after mount so the server and client markup match. */
export function ThemeToggle() {
  const { theme = 'system', setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const current = mounted && theme in NEXT_THEME ? (theme as keyof typeof NEXT_THEME) : 'system';

  return (
    <Button type="button" variant="outline" size="sm" aria-label="Đổi giao diện sáng/tối" onClick={() => setTheme(NEXT_THEME[current])}>
      {LABELS[current]}
    </Button>
  );
}
