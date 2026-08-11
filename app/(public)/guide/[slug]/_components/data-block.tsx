import type { ReactElement } from 'react';
import { SourceCaption } from '@/components/ui/source-caption';
import type { DataSourceId } from '@/lib/data-sources';
import { formatAsOf } from '@/lib/format';
import type { GuideDataBlockKey } from '@/lib/guide/data-blocks';
import { getHospitalByType } from '@/lib/guide/blocks/hospital-by-type';
import { getChildcareByType } from '@/lib/guide/blocks/childcare-by-type';
import { getChildcareWaitlist } from '@/lib/guide/blocks/childcare-waitlist';
import { getChargerMix } from '@/lib/guide/blocks/charger-mix';
import { readGuideSnapshot } from '@/lib/guide/data-snapshot';
import type { AreaPriceResult } from '@/lib/guide/blocks/heavy/area-price';
import type { FloorPremiumResult } from '@/lib/guide/blocks/heavy/floor-premium';
import type { PriceTrendResult } from '@/lib/guide/blocks/heavy/price-trend';
import type { SubwayPremiumResult } from '@/lib/guide/blocks/heavy/subway-premium';
import type { LtvByRegionResult } from '@/lib/guide/blocks/heavy/ltv-by-region';

/**
 * 블록 공용 셸. 제목·표·기준일·출처 캡션을 한 형태로 묶는다.
 *
 * 기준일은 두 형태를 받는다. 레지스트리 블록은 레코드의 `updatedAt`(Date)이고, 실거래 블록은
 * 집계에 쓰인 최신 **계약일** 문자열(YYYY-MM-DD)이다 — 신고 지연 때문에 적재 시각과 다르다.
 */
function BlockShell({
  title, note, sources, headers, rows, asOf, asOfText,
}: {
  title: string;
  note: string;
  sources: DataSourceId[];
  headers: string[];
  rows: (string | number)[][];
  asOf?: Date | null;
  asOfText?: string | null;
}) {
  const asOfLabel = asOf ? formatAsOf(asOf) : (asOfText?.replace(/-/g, '.') ?? null);
  return (
    <section className="my-8 rounded-[18px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
      <h3 className="text-base font-bold text-[var(--color-blue-dark)]">{title}</h3>
      <p className="mt-1 text-sm text-[var(--color-muted)]">{note}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line)]">
              {headers.map((h, i) => (
                <th key={h} scope="col" className={`py-2 text-xs font-bold text-[var(--color-muted)] ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r[0])} className="border-b border-[var(--color-line)] last:border-b-0">
                {r.map((c, i) => (
                  <td key={i} className={`py-2 text-[var(--color-text)] ${i === 0 ? 'text-left' : 'text-right'}`}>
                    {typeof c === 'number' ? c.toLocaleString('ko-KR') : c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {asOfLabel && <p className="mt-3 text-xs text-[var(--color-muted)]">데이터 기준일 {asOfLabel}</p>}
      <SourceCaption ids={sources} />
    </section>
  );
}

async function HospitalByType() {
  const data = await getHospitalByType().catch(() => null);
  if (!data || data.rows.length === 0) return null;
  return (
    <BlockShell
      title="종별 병원 수와 평균 의사 수"
      note="임장ON이 수집한 전국 의료기관 자료를 종별로 집계한 값입니다. 평균 의사 수는 인원이 공시된 기관만 반영한 값입니다."
      sources={['hira']}
      headers={['종별', '기관 수', '평균 의사 수']}
      rows={data.rows.map((r) => [r.typeName, r.count, r.avgDoctors ?? '-'])}
      asOf={data.asOf}
    />
  );
}

async function ChildcareByType() {
  const data = await getChildcareByType().catch(() => null);
  if (!data || data.rows.length === 0) return null;
  return (
    <BlockShell
      title="유형별 어린이집 수와 정원"
      note="운영 중인 어린이집만 집계했습니다. 정원·현원은 값이 공시된 어린이집만 반영한 유형별 평균입니다."
      sources={['childcare']}
      headers={['유형', '어린이집 수', '평균 정원', '평균 현원']}
      rows={data.rows.map((r) => [r.crType, r.count, r.avgCapacity ?? '-', r.avgCurrent ?? '-'])}
      asOf={data.asOf}
    />
  );
}

async function ChildcareWaitlist() {
  const data = await getChildcareWaitlist().catch(() => null);
  if (!data || data.rows.length === 0) return null;
  return (
    <BlockShell
      title="대기 등록이 많은 지역"
      note="대기자가 등록된 어린이집이 있는 시군구 상위 10곳입니다. 한 아동이 여러 어린이집에 동시에 대기 등록할 수 있어 실제 대기 아동 수보다 많을 수 있습니다."
      sources={['childcare']}
      headers={['지역', '대기 등록 건수', '해당 어린이집 수']}
      rows={data.rows.map((r) => [`${r.sido} ${r.sigungu}`, r.waitTotal, r.facilities])}
      asOf={data.asOf}
    />
  );
}

async function ChargerMix() {
  const data = await getChargerMix().catch(() => null);
  if (!data || data.rows.length === 0) return null;
  return (
    <BlockShell
      title="충전 속도별 충전소 분포"
      note="지점 수와 각 지점에 설치된 충전기 수를 속도별로 집계했습니다."
      sources={['kepco-ev']}
      headers={['충전 속도', '지점 수', '충전기 수']}
      rows={data.rows.map((r) => [r.chargeSpeed, r.stations, r.chargers])}
      asOf={data.asOf}
    />
  );
}

// ---- 무거운 블록: ETL이 만든 스냅샷을 읽는다. 요청 경로에서 실거래를 집계하지 않는다. ----

/** 만원 단위 금액을 "11억 2,000만원" 형태로. 억 미만은 만원만 쓴다. */
function manwonLabel(manwon: number): string {
  const eok = Math.floor(manwon / 10_000);
  const rest = Math.round(manwon % 10_000);
  if (eok === 0) return `${rest.toLocaleString('ko-KR')}만원`;
  return rest === 0 ? `${eok}억원` : `${eok}억 ${rest.toLocaleString('ko-KR')}만원`;
}

async function AreaPrice() {
  const d = await readGuideSnapshot<AreaPriceResult>('area-price').catch(() => null);
  if (!d || d.rows.length === 0) return null;
  return (
    <BlockShell
      title="전용면적 구간별 평당 거래가"
      note="최근 12개월 아파트 매매 실거래를 전용면적 구간으로 나눠 평당 가격을 낸 값입니다."
      sources={['molit-rtms']}
      headers={['전용면적', '거래 건수', '평당 거래가']}
      rows={d.rows.map((r) => [r.band, r.n, `${r.manwonPerPyeong.toLocaleString('ko-KR')}만원`])}
      asOfText={d.asOf}
    />
  );
}

async function FloorPremium() {
  const d = await readGuideSnapshot<FloorPremiumResult>('floor-premium').catch(() => null);
  if (!d || d.groupsUsed === 0) return null;
  const sign = d.medianPctPerFloor >= 0 ? '+' : '';
  return (
    <BlockShell
      title="한 층 올라갈 때 값은 얼마나 달라지나"
      note="같은 단지·같은 평형 안에서만 비교한 값입니다. 전국의 저층과 고층을 그냥 견주면 고층이 있는 건물이 대체로 더 새 건물이라 생기는 차이까지 층 효과로 읽히기 때문입니다. 층이 가격을 설명하는 조합만 골라(설명력 R² 0.2 이상) 그 분포의 중앙값을 냈습니다."
      sources={['molit-rtms']}
      headers={['구분', '값']}
      rows={[
        ['한 층당 평당가 변화(중앙값)', `${sign}${d.medianPctPerFloor}%`],
        ['중간 절반의 범위', `${d.p25}% ~ ${d.p75}%`],
        ['분석한 단지·평형 조합', `${d.groups.toLocaleString('ko-KR')}개`],
        ['그중 층으로 설명된 조합', `${d.groupsUsed.toLocaleString('ko-KR')}개`],
      ]}
      asOfText={d.asOf}
    />
  );
}

async function PriceTrend24m() {
  const d = await readGuideSnapshot<PriceTrendResult>('price-trend-24m').catch(() => null);
  if (!d || d.points.length === 0) return null;
  // 24행은 본문에서 너무 길다. 최근 12개월만 최신순으로 낸다.
  const recent = d.points.slice(-12).reverse();
  return (
    <BlockShell
      title="월별 거래량과 중위 평당가"
      note="아파트 매매 실거래의 월별 건수와 중위 평당가입니다. 계약일 기준이며, 신고 기한이 30일이라 가장 최근 달은 앞으로 건수가 더 늘어날 수 있습니다. 평균 대신 중위값을 써서 초고가 거래가 추이를 흔들지 않게 했습니다."
      sources={['molit-rtms']}
      headers={['월', '거래 건수', '중위 평당가']}
      rows={recent.map((p) => [
        p.month.replace('-', '.'),
        p.n,
        `${p.medianPerPyeong.toLocaleString('ko-KR')}만원`,
      ])}
      asOfText={d.asOf}
    />
  );
}

async function SubwayPremium() {
  const d = await readGuideSnapshot<SubwayPremiumResult>('subway-premium').catch(() => null);
  if (!d || d.sigungus === 0) return null;
  const sign = d.medianPremiumPct >= 0 ? '+' : '';
  return (
    <BlockShell
      title="역 도보권 아파트는 얼마나 다른가"
      note={`역에서 ${d.walkRadiusMeters}m 이내 아파트와 같은 시군구의 그 밖 아파트를 평당 거래가로 비교했습니다. 전국을 한 번에 견주면 지하철이 수도권에 몰려 있어 사실상 수도권과 지방을 비교하게 되므로, 같은 시군구 안에서만 비교했습니다.`}
      sources={['molit-rtms', 'subway']}
      headers={['구분', '값']}
      rows={[
        ['시군구별 차이(중앙값)', `${sign}${d.medianPremiumPct}%`],
        ['중간 절반의 범위', `${d.p25}% ~ ${d.p75}%`],
        ['비교한 시군구', `${d.sigungus}곳`],
        ['차이가 없거나 더 싼 시군구', `${d.noPremiumSigungus}곳`],
      ]}
      asOfText={d.asOf}
    />
  );
}

async function LtvByRegion() {
  const d = await readGuideSnapshot<LtvByRegionResult>('ltv-by-region').catch(() => null);
  if (!d || d.rows.length === 0) return null;
  return (
    <BlockShell
      title="지역별 중위 매매가와 필요 자기자금(예시)"
      note="최근 12개월 아파트 매매의 시도별 중위 가격입니다. 오른쪽 세 칸은 그 가격에 예시 LTV를 적용했을 때 남는 자기자금입니다. LTV는 예시 비율이며 규제지역·주택 수·대출 목적에 따라 실제 적용 기준이 다릅니다. 평균 대신 중위값을 써서 초고가 거래에 끌리지 않게 했습니다."
      sources={['molit-rtms']}
      headers={['지역', '중위 매매가', ...d.exampleLtvPct.map((p) => `LTV ${p}% 시 자기자금`)]}
      rows={d.rows.map((r) => [
        r.sido,
        manwonLabel(r.medianManwon),
        ...d.exampleLtvPct.map((p) => manwonLabel(Math.round((r.medianManwon * (100 - p)) / 100))),
      ])}
      asOfText={d.asOf}
    />
  );
}

/**
 * 블록 키 → 컴포넌트 매핑. `Record<GuideDataBlockKey, ...>`로 타입을 명시해
 * `lib/guide/data-blocks.ts`의 키 목록과 어긋나면 컴파일 에러가 나도록 한다.
 */
export const GUIDE_DATA_BLOCK_COMPONENTS: Record<GuideDataBlockKey, () => Promise<ReactElement | null>> = {
  'hospital-by-type': HospitalByType,
  'childcare-by-type': ChildcareByType,
  'childcare-waitlist': ChildcareWaitlist,
  'charger-mix': ChargerMix,
  'area-price': AreaPrice,
  'floor-premium': FloorPremium,
  'price-trend-24m': PriceTrend24m,
  'subway-premium': SubwayPremium,
  'ltv-by-region': LtvByRegion,
};
