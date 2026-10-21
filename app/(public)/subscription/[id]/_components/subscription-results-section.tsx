import { Card } from '@/components/ui/card';
import { SourceCaption } from '@/components/ui/source-caption';
import type {
  AptResultsView,
  SimpleResultsView,
  SubscriptionResultsData,
} from '@/lib/insights/subscription-results';

/**
 * 청약 상세 · 청약 결과(청약홈 경쟁률·당첨가점·특별공급). UI 확정본: docs/superpowers/mockups/2026-10-20-subscription-results.html
 * 공식값을 그대로 보여주고 당첨 가능성·다른 공고와의 비교는 하지 않는다.
 */
const SIMPLE_LABEL: Record<string, string> = {
  OFFICETEL_ETC: '오피스텔·도시형생활주택',
  PUB_PRIV_RENT: '공공지원민간임대',
  REMNANT: '무순위·잔여세대',
  ARBITRARY: '임의공급',
};

const th = 'whitespace-nowrap border-b border-[var(--color-line)] px-1.5 py-2 text-right text-[12.5px] font-medium text-[var(--color-muted)] first:text-left';
const td = 'whitespace-nowrap border-b border-[var(--color-soft)] px-1.5 py-2.5 text-right first:text-left';

function cellClass(v: string): string {
  if (v.startsWith('미달')) return `${td} text-orange-800`;
  if (v === '—') return `${td} text-[var(--color-muted)]`;
  return td;
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={j === 0 ? td : cellClass(c)}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const h3 = 'mb-2 mt-5 text-[15px] font-bold';
const note = 'mt-1.5 text-[13px] text-[var(--color-muted)]';

function AptBlocks({ v }: { v: AptResultsView }) {
  const s = v.summary;
  const hasRank2 = v.columns.includes('2순위');
  return (
    <>
      {s.overall && (
        <div className="rounded-2xl bg-[var(--color-soft)] px-[18px] py-4 text-[15px] leading-relaxed">
          1순위 해당지역 전체 <b className="text-xl text-[var(--color-blue-dark)]">{s.overall}대 1</b>
          {s.top && (
            <>
              {' '}· 최고 {s.top.type} <b className="text-xl text-[var(--color-blue-dark)]">{s.top.rate}대 1</b>
            </>
          )}
          {s.shortfall > 0 && (
            <>
              {' '}· {hasRank2 ? '2순위까지 ' : ''}최종 미달{' '}
              <b className="text-xl text-orange-800">{s.shortfall.toLocaleString('ko-KR')}세대</b>
            </>
          )}
          <br />
          <span className="text-xs text-[var(--color-muted)]">
            임장ON 계산: 1순위 해당지역 접수 합 {s.requests.toLocaleString('ko-KR')}건 ÷ 일반공급{' '}
            {s.supply.toLocaleString('ko-KR')}세대{s.shortfall > 0 ? ' · 미달 세대는 청약홈 공식 집계' : ''}
          </span>
        </div>
      )}

      <h3 className={h3}>주택형별 경쟁률</h3>
      <Table head={['주택형', ...v.columns]} rows={v.rows.map((r) => [r.type, ...r.cells])} />
      {(v.hasShort || v.hasDash) && (
        <p className={note}>
          {[
            v.hasShort ? '미달 세대는 앞 단계부터 누적한 잔여 세대(청약홈 공식값)' : null,
            v.hasDash ? '— : 앞 순위에서 마감돼 접수하지 않음' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}

      {v.scores && (
        <>
          <h3 className={h3}>
            당첨 가점{' '}
            <span className="text-[13px] font-normal text-[var(--color-muted)]">
              {v.scores.showRegion ? '가점제 당첨자가 있는 주택형만' : `${v.scores.region} · 가점제 당첨자`}
            </span>
          </h3>
          <Table
            head={v.scores.showRegion ? ['주택형', '지역', '최저', '평균', '최고'] : ['주택형', '최저', '평균', '최고']}
            rows={v.scores.rows.map((r) =>
              v.scores!.showRegion ? [r.type, r.region, r.low, r.avg, r.top] : [r.type, r.low, r.avg, r.top],
            )}
          />
        </>
      )}

      {v.special && (
        <>
          <h3 className={h3}>특별공급 유형별</h3>
          <Table head={['유형', '배정', '접수', '경쟁률']} rows={v.special.map((r) => [r.label, r.alloc, r.req, r.rate])} />
        </>
      )}
    </>
  );
}

function SimpleBlock({ v }: { v: SimpleResultsView }) {
  const head = [v.typeHeader, ...(v.kindHeader ? [v.kindHeader] : []), '공급', '접수', '경쟁률'];
  return (
    <Table
      head={head}
      rows={v.rows.map((r) => [r.type, ...(v.kindHeader ? [r.kind ?? ''] : []), r.supply, r.req, r.rate])}
    />
  );
}

export function SubscriptionResultsSection({
  data,
  category,
}: {
  data: SubscriptionResultsData | null;
  category: string;
}) {
  if (!data) return null;
  const { view, fetchedLabel } = data;
  const apt = view.kind === 'apt';
  return (
    <Card id="results">
      <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-[var(--color-blue-dark)]">청약 결과</h2>
        <span className="text-[13px] text-[var(--color-muted)]">
          {apt ? '일반공급 기준' : (SIMPLE_LABEL[category] ?? '')}
        </span>
      </div>

      {view.kind === 'apt' ? <AptBlocks v={view} /> : <SimpleBlock v={view} />}

      <div className="mt-4 border-t border-[var(--color-line)] pt-3 text-xs leading-relaxed text-[var(--color-muted)]">
        <p>
          출처: 한국부동산원 청약홈 · {fetchedLabel} 조회
          {view.kind === 'apt' && view.special ? ' · 특별공급 경쟁률은 임장ON 계산(접수 ÷ 배정, 기관추천 제외)' : ''}
        </p>
        <p className="mt-1">은행 전산 사정으로 접수건수가 일부 변동될 수 있으며, 최종 결과는 청약홈에서 확인하세요.</p>
        <SourceCaption ids={['applyhome']} className="mt-1" />
      </div>
    </Card>
  );
}
