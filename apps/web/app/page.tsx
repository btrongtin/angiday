import { getDb, listPlaces, listTags } from '@angiday/db';
import { formatAreaLabel, formatClassificationLine } from '@angiday/shared';
import { getWebEnv } from '@/lib/env';
import { requireSession } from '@/lib/session';
import { logout } from './login/actions';

export default async function HomePage() {
  await requireSession();
  const env = getWebEnv();
  const db = await getDb(env.MONGODB_URI);
  const [places, tags] = await Promise.all([listPlaces(db, env.GROUP_ID), listTags(db, env.GROUP_ID)]);
  const tagNames = new Map(tags.map((tag) => [tag.id, tag.name]));

  return (
    <main>
      <h1>AnGiDay</h1>
      {places.length === 0 ? (
        <p>Chưa có quán nào. Gửi link Google Maps vào nhóm Telegram để lưu quán đầu tiên.</p>
      ) : (
        <>
          <ul>
            {places.map((place) => {
              const areaLabel = formatAreaLabel(place.area);
              const classification = formatClassificationLine(place);
              // Ids of deleted tags no longer resolve; they are skipped (ADR-0006).
              const placeTags = place.tagIds.flatMap((id) => tagNames.get(id) ?? []);
              return (
                <li key={place.id}>
                  <a href={place.mapsUrl} target="_blank" rel="noreferrer">
                    {place.name}
                  </a>
                  {areaLabel !== null && <div>{areaLabel}</div>}
                  {place.address !== null && <div>{place.address}</div>}
                  {classification !== null && <div>{classification}</div>}
                  {place.highlights.length > 0 && <div>Món nổi bật: {place.highlights.join(', ')}</div>}
                  {placeTags.length > 0 && <div>Tag: {placeTags.join(', ')}</div>}
                </li>
              );
            })}
          </ul>
          <footer>
            <p>
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                Dữ liệu địa chỉ © OpenStreetMap contributors
              </a>
            </p>
            <p>
              <a href="https://www.geoboundaries.org" target="_blank" rel="noreferrer">
                Ranh giới quận cũ: geoBoundaries / OCHA ROAP (CC BY 3.0 IGO)
              </a>
            </p>
          </footer>
        </>
      )}
      <form action={logout}>
        <button type="submit">Đăng xuất</button>
      </form>
    </main>
  );
}
