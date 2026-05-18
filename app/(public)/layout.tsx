import Link from 'next/link';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-white/85 backdrop-blur">
        <nav className="mx-auto flex h-[72px] max-w-[1180px] items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-[34px] w-[34px] place-items-center rounded-xl bg-gradient-to-br from-[var(--color-blue)] to-[var(--color-sky)] text-white text-base font-black">
              임
            </span>
            <span className="text-[22px] font-black tracking-tighter text-[var(--color-blue-dark)]">
              임장온
            </span>
          </Link>
          <div className="hidden gap-6 text-[15px] font-semibold text-[var(--color-muted)] md:flex">
            <Link href="/">홈</Link>
            <Link href="/apt">아파트</Link>
            <Link href="/officetel">오피스텔</Link>
            <Link href="/villa">다세대</Link>
            <Link href="/region">지역</Link>
            <span className="inline-flex items-center gap-1">
              청약{' '}
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs">Soon</span>
            </span>
            <span className="inline-flex items-center gap-1">
              생활권{' '}
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs">Soon</span>
            </span>
          </div>
        </nav>
      </header>

      <main>{children}</main>

      <footer className="mt-24 border-t border-[var(--color-line)] bg-white">
        <div className="mx-auto max-w-[1180px] px-6 py-10 text-sm text-[var(--color-muted)]">
          <p>© 2026 임장온. 본 사이트는 국토교통부·행정안전부 공공데이터를 가공해 제공합니다.</p>
          <p className="mt-1">실거래 신고 지연으로 최신성·정확성이 100% 보장되지 않습니다.</p>
        </div>
      </footer>
    </div>
  );
}
