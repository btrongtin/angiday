import { Suspense } from 'react';
import { getDb, listTags } from '@angiday/db';
import { parsePlaceFilters, placeFiltersToSearchParams } from '@angiday/shared';
import { PlaceFilterForm } from '@/components/place-filter-form';
import { PlaceResults, PlaceResultsSkeleton } from '@/components/place-results';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { getWebEnv } from '@/lib/env';
import { dropUnknownTags } from '@/lib/known-tags';
import { requireSession } from '@/lib/session';
import { logout } from './login/actions';

export default async function HomePage({ searchParams }: PageProps<'/'>) {
  await requireSession();
  const env = getWebEnv();
  const requested = parsePlaceFilters(await searchParams);
  const db = await getDb(env.MONGODB_URI);
  const tags = await listTags(db, env.GROUP_ID);
  const filters = dropUnknownTags(requested, tags);
  const tagNames = new Map(tags.map((tag) => [tag.id, tag.name]));
  const filtersKey = placeFiltersToSearchParams(filters).toString();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between gap-3 border-b-2 border-foreground pb-3">
        <h1 className="font-heading text-3xl">AnGiDay</h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              Đăng xuất
            </Button>
          </form>
        </div>
      </header>

      <main className="flex flex-col gap-6">
        <PlaceFilterForm filters={filters} tags={tags} />

        {/* Keyed on the filters so a new search shows the skeleton here instead of freezing the old list. */}
        <Suspense key={filtersKey} fallback={<PlaceResultsSkeleton />}>
          <PlaceResults db={db} groupId={env.GROUP_ID} filters={filters} tagNames={tagNames} />
        </Suspense>
      </main>

      <footer className="mt-auto flex flex-col gap-1 border-t border-border pt-4 font-small text-[0.8125rem] text-muted-foreground">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline underline-offset-4">
          Dữ liệu địa chỉ © OpenStreetMap contributors
        </a>
        <a href="https://www.geoboundaries.org" target="_blank" rel="noreferrer" className="underline underline-offset-4">
          Ranh giới quận cũ: geoBoundaries / OCHA ROAP (CC BY 3.0 IGO)
        </a>
      </footer>
    </div>
  );
}
