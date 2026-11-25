import { readSigunguMedianSnapshot, type SigunguMedian } from '@/lib/subscription/median-snapshot';
import { resolveSigunguFromAddress } from '@/lib/region/from-address';
import { formatBillion } from '@/lib/format';
import { SourceCaption } from '@/components/ui/source-caption';
import Link from 'next/link';
import type { NewbuildView } from '@/lib/subscription/newbuild-compare';
import type { PeerCompetitionSnapshot } from '@/lib/subscription/peer-competition';

const PYEONG = 3.3058;
const won33 = (ppa: number) => `${Math.round(ppa * PYEONG).toLocaleString('ko-KR')}만원`;
const ratio = (r: number) => `${(Math.round(r * 100) / 100).toFixed(2)}배`;
const cmpRate = (r: number) => `${r.toFixed(2)} : 1`;

/** label이 없거나 빈 값일 때(이 필드가 생기기 전에 쓰인 스냅샷) 쓰는 예전 문구. */
const FALLBACK_LABEL = '시군구';

/**
 * 순수 표현 뷰. local의 형태는 이미 PriceComparison에서 검증됐다고 가정한다.
 *
 * label은 실거래가 실제로 집계된 단위(수원시·강남구 등)를 그대로 보여준다 — "같은 시군구"라고만
 * 쓰면, 일반구 도시(수원 등)는 구 단위 공고인데도 시 전체를 합친 건수를 마치 그 구의 것처럼
 * 읽히게 만든다(예: 팔달구 공고에 수원시 전체 17,116건이 "같은 시군구" 밑에 뜨는 문제). label이
 * 없는 옛 스냅샷 데이터는 예전 문구로 폴백한다 — 줄 자체를 생략하지는 않는다, median/count는
 * 여전히 유효한 값이라서다.
 */
export function PriceComparisonView({
  local,
  rental = false,
  newbuild = null,
  peers = null,
  guide,
}: {
  local: SigunguMedian | null;
  rental?: boolean;
  /** APT 분양주택만: 주택형별 분양가 ÷ 반경 2km 준공 10년 이내 아파트 같은 면적대 ㎡당 중간값. */
  newbuild?: NewbuildView | null;
  /** APT 분양주택만: 같은 시도·비슷한 ㎡당 분양가 공고의 1순위 해당지역 경쟁률. */
  peers?: PeerCompetitionSnapshot | null;
  guide?: { slug: string; title: string } | null;
}) {
  const groupLabel = local && typeof local.label === 'string' && local.label.length > 0 ? local.label : FALLBACK_LABEL;

  return (
    <section className="my-8 rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
      <h2 className="text-base font-bold text-[var(--color-blue-dark)]">
        {newbuild ? '분양가와 주변 신축 시세' : `같은 ${groupLabel} 실거래 시세`}
      </h2>
      {newbuild && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-[var(--color-text)]">
            주변 신축 대비 분양가{' '}
            <strong className="text-lg text-[var(--color-blue-dark)]">
              {newbuild.minRatio === newbuild.maxRatio ? ratio(newbuild.minRatio) : `${ratio(newbuild.minRatio)}~${ratio(newbuild.maxRatio)}`}
            </strong>
          </p>
          <p className="break-keep text-sm leading-relaxed text-[var(--color-text)]">
            반경 2km 안 준공 10년 이내 아파트 {newbuild.complexes}개 단지의 공고 전 12개월 매매 {newbuild.n.toLocaleString('ko-KR')}건과
            주택형별로 같은 면적대끼리 비교했습니다.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-[var(--color-line)]">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="bg-[var(--color-soft)] text-left text-xs text-[var(--color-muted)]">
                  <th className="px-4 py-2.5 font-semibold">주택형</th>
                  <th className="px-4 py-2.5 text-right font-semibold">분양가 전용 3.3㎡당</th>
                  <th className="px-4 py-2.5 text-right font-semibold">주변 신축 같은 면적대</th>
                  <th className="px-4 py-2.5 text-right font-semibold">배율</th>
                </tr>
              </thead>
              <tbody>
                {newbuild.rows.map((r) => (
                  <tr key={r.houseType} className="border-t border-[var(--color-line)]">
                    <td className="px-4 py-2.5 font-semibold text-[var(--color-blue-dark)]">{r.houseType}</td>
                    <td className="px-4 py-2.5 text-right">{won33(r.ppa)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {won33(r.nearbyMed)} <span className="text-xs text-[var(--color-muted)]">({r.nearbyN}건)</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-[var(--color-blue-dark)]">{ratio(r.ratio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {newbuild.top.length > 0 && (
            <div>
              <p className="text-sm font-bold text-[var(--color-blue-dark)]">비교에 많이 쓰인 주변 신축 단지</p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {newbuild.top.map((c) => (
                  <li key={c.name} className="rounded-xl bg-[var(--color-soft)] px-3 py-2 text-sm">
                    <b className="text-[var(--color-blue-dark)]">{c.name}</b>
                    <span className="block text-xs text-[var(--color-muted)]">
                      {c.builtYear}년 · {(c.distanceM / 1000).toFixed(1)}km · {c.n}건 · 전용 3.3㎡당 {won33(c.med)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs leading-relaxed text-[var(--color-muted)]">
            분양가는 주택형별 최고 공급금액이며 발코니 확장비·옵션은 빠져 있습니다. 주변 시세는 공고 전 12개월 매매(해제 거래 제외)라
            입주 시점 시세와 다릅니다. 같은 면적대 주변 거래가 10건 미만인 주택형은 표에서 뺐습니다.
          </p>
        </div>
      )}
      {local && (
        <p className={`text-sm text-[var(--color-text)] ${newbuild ? 'mt-4 border-t border-[var(--color-line)] pt-3' : 'mt-3'}`}>
          {newbuild ? `${groupLabel} ` : ''}최근 12개월 아파트 매매 중위가 <strong>{formatBillion(local.median)}</strong>
          <span className="text-[var(--color-muted)]"> · 거래 {local.count.toLocaleString('ko-KR')}건</span>
        </p>
      )}
      {!newbuild && (
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          {rental
            ? '이 공고는 임대주택이라, 공고의 공급금액을 매매 실거래가와 그대로 비교할 수 없습니다.'
            : '분양가는 공고에 적힌 최고 공급금액입니다. 실거래는 전용면적 기준이라, 면적당 단가는 비교하지 않았습니다.'}
        </p>
      )}
      {peers && <PeerCompetition peers={peers} />}
      {(newbuild || peers) && guide && (
        <Link href={`/guide/${guide.slug}`} className="mt-3 block text-sm font-bold text-[var(--color-blue)] hover:underline">
          관련 분석 · {guide.title} →
        </Link>
      )}
      <SourceCaption ids={['applyhome', 'molit-rtms']} />
    </section>
  );
}

/** 같은 가격대 공고 경쟁률. 가격은 위 표와 같은 전용 3.3㎡당으로 보여준다. */
function PeerCompetition({ peers }: { peers: PeerCompetitionSnapshot }) {
  return (
    <div className="mt-4 rounded-2xl bg-[var(--color-soft)] p-4">
      <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">같은 가격대 공고 경쟁률</h3>
      <p className="mt-0.5 break-keep text-xs text-[var(--color-muted)]">
        {peers.sido} · 최근 24개월 · 분양가 전용 3.3㎡당 {won33(peers.lo)}~{won33(peers.hi)} 공고 {peers.n}건
      </p>
      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
        <div>
          <dd className="text-lg font-bold text-[var(--color-blue-dark)] tabular-nums">{cmpRate(peers.med)}</dd>
          <dt className="text-xs text-[var(--color-muted)]">비교 공고 1순위 해당지역 경쟁률 중간값</dt>
        </div>
        <div>
          <dd className="text-lg font-bold text-[var(--color-blue-dark)] tabular-nums">{peers.own != null ? cmpRate(peers.own) : '—'}</dd>
          <dt className="text-xs text-[var(--color-muted)]">{peers.own != null ? '이 공고' : '이 공고(청약 결과 수집 전)'}</dt>
        </div>
      </dl>
      <p className="mt-3 text-xs font-semibold text-[var(--color-muted)]">분양가가 가까운 공고</p>
      <ul className="mt-1.5 divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)] bg-white">
        {peers.top.map((p) => (
          <li key={p.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
            <div className="min-w-0">
              <Link href={`/subscription/${p.id}`} className="break-keep font-semibold text-[var(--color-blue)] hover:underline">
                {p.name}
              </Link>
              <span className="block text-xs text-[var(--color-muted)] tabular-nums">
                {p.ym} 공고 · 전용 3.3㎡당 {won33(p.ppa)}
              </span>
            </div>
            <span className="shrink-0 font-bold text-[var(--color-blue-dark)] tabular-nums">{cmpRate(p.rate)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-[var(--color-muted)]">
        경쟁률은 입지·공급 규모·시기에 따라 크게 달라지는 참고값입니다. 1 : 1 미만은 1순위 해당지역 접수가 공급보다 적었다는
        뜻입니다. 조합원 취소분 공고와 해당지역에 일부만 배정한 공고는 비교에서 뺐습니다.
      </p>
    </div>
  );
}

/**
 * 이 공고 지역의 최근 실거래 중위가를 한 줄로 보여준다(async 데이터 래퍼).
 *
 * 분양가 자체는 바로 위 UnitSupplyTable이 이미 보여주므로 여기서 표를 다시 그리지 않는다 —
 * 예전엔 이 컴포넌트도 주택형별 분양가 표를 따로 그려 UnitSupplyTable과 near-duplicate였다.
 *
 * **면적당 단가는 비교하지 않는다.** `SubscriptionUnit.area`의 기준이 행마다 다르고(공급 80% /
 * 전용 12%, UnitSupplyTable 참고) 실거래는 전용면적이라, 단가를 나란히 두면 비교가 안 된다.
 * 총액끼리만 본다.
 */
export async function PriceComparison({
  address,
  rental = false,
  newbuild = null,
  peers = null,
  guide = null,
}: {
  address: string | null;
  rental?: boolean;
  newbuild?: NewbuildView | null;
  peers?: PeerCompetitionSnapshot | null;
  guide?: { slug: string; title: string } | null;
}) {
  const sgg = await resolveSigunguFromAddress(address).catch(() => null);
  const snapshot = sgg ? await readSigunguMedianSnapshot().catch(() => null) : null;
  const local = sgg && snapshot ? snapshot[sgg] : null;
  // readSigunguMedianSnapshot()은 DashboardSnapshot.payload를 검증 없이 캐스팅한다.
  // payload가 기대한 { median, count } 형태가 아니면(예: 마이그레이션 중 값 손상) 여기서
  // count.toLocaleString()이 서버 컴포넌트 안에서 던져 그 시군구의 모든 페이지가 500이 된다 —
  // 렌더 전에 형태를 확인해 어긋나면 줄 자체를 생략한다. label은 없어도(옛 스냅샷) 던지지
  // 않는다 — PriceComparisonView가 폴백 문구로 대체한다.
  const localOk = !!local && Number.isFinite(local.median) && Number.isFinite(local.count);
  if (!localOk && !newbuild && !peers) return null;

  return <PriceComparisonView local={localOk ? local : null} rental={rental} newbuild={newbuild} peers={peers} guide={guide} />;
}
