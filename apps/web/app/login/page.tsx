import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { login } from './actions';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <h1 className="font-heading text-4xl">AnGiDay</h1>
      <form action={login} className="label-well flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="username">Tên đăng nhập</Label>
          <Input id="username" name="username" autoComplete="username" required className="h-11 bg-card" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Mật khẩu</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11 bg-card" />
        </div>
        <p role="alert" className="min-h-[1lh] text-[0.9375rem] text-destructive">
          {error ? 'Sai tên đăng nhập hoặc mật khẩu.' : null}
        </p>
        <Button type="submit" size="lg">
          Đăng nhập
        </Button>
      </form>
    </main>
  );
}
