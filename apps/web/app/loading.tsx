export default function Loading() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-4 py-6" role="status" aria-label="Đang tải">
      <div className="h-8 w-32 animate-pulse rounded-lg bg-secondary" />
      <div className="h-11 animate-pulse rounded-lg bg-secondary" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-secondary" />
      ))}
    </div>
  );
}
