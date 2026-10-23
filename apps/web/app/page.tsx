import { getDb, listPlaces } from '@angiday/db';
import { formatAreaLabel } from '@angiday/shared';
import { getWebEnv } from '@/lib/env';
import { requireSession } from '@/lib/session';
import { logout } from './login/actions';

export default async function HomePage() {
  await requireSession();
  const env = getWebEnv();
  const places = await listPlaces(await getDb(env.MONGODB_URI), env.GROUP_ID);

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
              return (
                <li key={place.id}>
                  <a href={place.mapsUrl} target="_blank" rel="noreferrer">
                    {place.name}
                  </a>
                  {areaLabel !== null && <div>{areaLabel}</div>}
                  {place.address !== null && <div>{place.address}</div>}
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
