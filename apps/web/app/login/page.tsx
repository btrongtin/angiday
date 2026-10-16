import { login } from './actions';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { error } = await searchParams;
  return (
    <main>
      <h1>AnGiDay</h1>
      <form action={login}>
        <label>
          Tên đăng nhập
          <input name="username" autoComplete="username" required />
        </label>
        <label>
          Mật khẩu
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error ? <p role="alert">Sai tên đăng nhập hoặc mật khẩu.</p> : null}
        <button type="submit">Đăng nhập</button>
      </form>
    </main>
  );
}
