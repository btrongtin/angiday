import { getDb, listPlaces } from '@angiday/db';
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
        <ul>
          {places.map((place) => (
            <li key={place.id}>
              <a href={place.mapsUrl} target="_blank" rel="noreferrer">
                {place.name}
              </a>
            </li>
          ))}
        </ul>
      )}
      <form action={logout}>
        <button type="submit">Đăng xuất</button>
      </form>
    </main>
  );
}
