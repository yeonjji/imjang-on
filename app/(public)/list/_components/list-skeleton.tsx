export function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-[22px] border border-[var(--color-line)] bg-white px-6 py-5 shadow-[var(--shadow)]"
        >
          <div className="flex flex-col gap-3">
            <div className="h-5 w-16 rounded-lg bg-[var(--color-soft)]" />
            <div className="h-6 w-48 rounded-lg bg-[var(--color-soft)]" />
            <div className="h-4 w-64 rounded-lg bg-[var(--color-soft)]" />
            <div className="grid grid-cols-3 gap-3">
              <div className="h-14 rounded-[14px] bg-[var(--color-soft)]" />
              <div className="h-14 rounded-[14px] bg-[var(--color-soft)]" />
              <div className="h-14 rounded-[14px] bg-[var(--color-soft)]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
