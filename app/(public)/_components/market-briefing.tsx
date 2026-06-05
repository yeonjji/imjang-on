import Link from 'next/link';
import { formatBillion } from '@/lib/format';
import type { MarketBriefing } from '@/lib/briefing';

export function MarketBriefing({ briefing }: { briefing: MarketBriefing | null }) {
  if (!briefing) return null;
  const { summary, popularRegions, surgeRegions, hashtags, refDate } = briefing;
  const maxCount = popularRegions[0]?.count ?? 1;
  const [, mm, dd] = refDate.split('-');

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h2 className="text-xl font-black tracking-tight md:text-[22px]">📈 오늘의 부동산 한입 브리핑</h2>
        <span className="text-[13px] text-[var(--color-muted)]">
          {Number(mm)}월 {Number(dd)}일 수집 기준 · 매매
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {hashtags.map((t) => (
          <span key={t} className="rounded-full border border-[var(--color-line)] bg-[var(--color-sky-soft)] px-2.5 py-1.5 text-xs font-bold text-[var(--color-blue)]">
            {t}
          </span>
        ))}
      </div>

      <div className="mt-[18px] grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* 카드1: 오늘의 실거래 한눈에 */}
        <section className="rounded-[20px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow)] md:col-span-2">
          <h3 className="mb-3.5 text-[15px] font-extrabold tracking-tight">
            오늘 시장에서 무슨 일이 <span className="text-[var(--color-blue)]">있었나</span>
          </h3>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-[var(--color-line)] md:grid-cols-5">
            <Tile k="🧾 오늘 등록된 실거래" v={`${summary.txCount.toLocaleString('ko-KR')}건`} sub="전국 매매 신고분" />
            {summary.highest && (
              <Tile k="🔥 최고가 거래" v={formatBillion(summary.highest.amountManwon)} sub={`${summary.highest.regionLabel} · ${summary.highest.propertyName}`} href={`/apt/${summary.highest.propertyId}`} />
            )}
            {summary.lowest && (
              <Tile k="📉 최저가 거래" v={formatBillion(summary.lowest.amountManwon)} sub={`${summary.lowest.regionLabel} · ${summary.lowest.propertyName}`} href={`/apt/${summary.lowest.propertyId}`} />
            )}
            {summary.topRegion && (
              <Tile k="🚀 가장 많이 거래된 지역" v={summary.topRegion.label} sub={`${summary.topRegion.count}건`} href={`/region/${summary.topRegion.code}`} />
            )}
            {summary.topAreaBand && <Tile k="💡 최다 거래 평형" v={summary.topAreaBand.label.replace('전용 ', '')} sub="전용면적 기준" />}
          </div>
        </section>

        {/* 카드2: 인기 동네 TOP5 */}
        {popularRegions.length > 0 && (
          <section className="rounded-[20px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow)]">
            <h3 className="mb-3.5 text-[15px] font-extrabold tracking-tight">
              오늘 가장 <span className="text-[var(--color-blue)]">인기있는 동네</span>
            </h3>
            <ul>
              {popularRegions.map((r, i) => (
                <li key={r.code} className="flex items-center gap-3 border-b border-dashed border-[var(--color-line)] py-2.5 last:border-0">
                  <span className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-md text-xs font-black ${i === 0 ? 'bg-[var(--color-blue)] text-white' : 'bg-[var(--color-soft)] text-[var(--color-blue-dark)]'}`}>{i + 1}</span>
                  <Link href={`/region/${r.code}`} className="w-[88px] flex-none text-sm font-bold hover:underline">{r.label}</Link>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-sky-soft)]">
                    <span className="block h-full rounded-full bg-gradient-to-r from-[var(--color-blue)] to-[var(--color-sky)]" style={{ width: `${Math.max(8, (r.count / maxCount) * 100)}%` }} />
                  </span>
                  <span className="w-12 text-right text-[13px] font-extrabold text-[var(--color-blue-dark)]">{r.count}건</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 카드3: 거래량 급증 동네 */}
        {surgeRegions.length > 0 && (
          <section className="rounded-[20px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow)]">
            <h3 className="mb-2 text-[15px] font-extrabold tracking-tight">오늘의 <span className="text-[var(--color-blue)]">발견</span></h3>
            <p className="mb-3 text-xs text-[var(--color-muted)]">최근 30일 거래량이 직전 30일보다 급증한 지역</p>
            <ul>
              {surgeRegions.map((s) => (
                <li key={s.code} className="flex items-center justify-between border-b border-dashed border-[var(--color-line)] py-2.5 last:border-0">
                  <Link href={`/region/${s.code}`} className="text-sm font-bold hover:underline">
                    📍 {s.label}
                    <small className="mt-0.5 block font-medium text-[var(--color-muted)]">최근 30일 {s.recent}건 (직전 {s.prev}건)</small>
                  </Link>
                  <span className="rounded-full bg-[#e8f8f1] px-2.5 py-1 text-[15px] font-black text-[var(--color-green)]">+{s.changePct}%</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </section>
  );
}

function Tile({ k, v, sub, href }: { k: string; v: string; sub: string; href?: string }) {
  const body = (
    <div className="h-full bg-white p-4">
      <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">{k}</div>
      <div className={`mt-1.5 text-[22px] font-black leading-tight tracking-tight ${href ? 'text-[var(--color-blue)]' : 'text-[var(--color-blue-dark)]'}`}>{v}</div>
      <div className="mt-0.5 truncate text-xs text-[var(--color-muted)]">{sub}</div>
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}
