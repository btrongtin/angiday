'use client';

import { Button } from '@/components/ui/button';

export default function ErrorState({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-start gap-3 px-4 py-6">
      <h1 className="font-heading text-3xl">AnGiDay</h1>
      <p role="alert">Không tải được danh sách.</p>
      <Button type="button" onClick={() => retry()}>
        Thử lại
      </Button>
    </main>
  );
}
