import Link from 'next/link';
import { getDb, listTags, SEARCH_LIMIT, searchPlaces } from '@angiday/db';
import { hasActiveFilters, parsePlaceFilters } from '@angiday/shared';
import { PlaceCard } from '@/components/place-card';
import { PlaceFilterForm } from '@/components/place-filter-form';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { getWebEnv } from '@/lib/env';
import { requireSession } from '@/lib/session';
import { logout } from './login/actions';

export default async function HomePage({ searchParams }: PageProps<'/'>) {
  await requireSession();
  const env = getWebEnv();
  const filters = parsePlaceFilters(await searchParams);
  const db = await getDb(env.MONGODB_URI);
  const [places, tags] = await Promise.all([searchPlaces(db, env.GROUP_ID, filters), listTags(db, env.GROUP_ID)]);
  const tagNames = new Map(tags.map((tag) => [tag.id, tag.name]));
  const filtered = hasActiveFilters(filters);

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

        {places.length === 0 ? (
          <div className="flex flex-col items-start gap-3 border border-dashed border-foreground/40 p-6">
            {filtered ? (
              <>
                <p>Không có quán nào khớp bộ lọc.</p>
                <Link href="/" className="underline underline-offset-4">
                  Xóa lọc
                </Link>
              </>
            ) : (
              <p>Chưa có quán nào. Gửi link Google Maps vào nhóm Telegram để lưu quán đầu tiên.</p>
            )}
          </div>
        ) : (
          <section aria-label="Danh sách quán" className="flex flex-col gap-5">
            <p className="font-small text-[0.9375rem] text-muted-foreground">{places.length} quán</p>
            {places.map((place) => (
              <PlaceCard key={place.id} place={place} tagNames={tagNames} />
            ))}
            {places.length === SEARCH_LIMIT && (
              <p className="text-[0.9375rem] text-muted-foreground">Chỉ hiển thị {SEARCH_LIMIT} quán mới nhất. Thu hẹp bộ lọc để thấy thêm.</p>
            )}
          </section>
        )}
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
