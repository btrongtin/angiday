import Link from 'next/link';
import { type Db, SEARCH_LIMIT, searchPlaces } from '@angiday/db';
import { hasActiveFilters, type PlaceFilters } from '@angiday/shared';
import { PlaceCard } from '@/components/place-card';

/** The only part of the home page that waits for the places query, so the header and the form stay put while it loads. */
export async function PlaceResults({
  db,
  groupId,
  filters,
  tagNames,
}: {
  db: Db;
  groupId: string;
  filters: PlaceFilters;
  tagNames: ReadonlyMap<string, string>;
}) {
  const places = await searchPlaces(db, groupId, filters);

  if (places.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 border border-dashed border-foreground/40 p-6">
        {hasActiveFilters(filters) ? (
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
    );
  }

  return (
    <section aria-label="Danh sách quán" className="flex flex-col gap-5">
      <p className="font-small text-[0.9375rem] text-muted-foreground">{places.length} quán</p>
      {places.map((place) => (
        <PlaceCard key={place.id} place={place} tagNames={tagNames} />
      ))}
      {places.length === SEARCH_LIMIT && (
        <p className="text-[0.9375rem] text-muted-foreground">Chỉ hiển thị {SEARCH_LIMIT} quán mới nhất. Thu hẹp bộ lọc để thấy thêm.</p>
      )}
    </section>
  );
}

/** Stand-in for the list while it loads: the same shape as the cards, nothing else on the page moves. */
export function PlaceResultsSkeleton() {
  return (
    <div className="flex flex-col gap-5" role="status">
      <span className="sr-only">Đang tải danh sách…</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-36 animate-pulse bg-secondary" />
      ))}
    </div>
  );
}
