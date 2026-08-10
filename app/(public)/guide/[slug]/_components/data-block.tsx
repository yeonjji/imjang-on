import type { ReactElement } from 'react';
import { SourceCaption } from '@/components/ui/source-caption';
import type { DataSourceId } from '@/lib/data-sources';
import { formatAsOf } from '@/lib/format';
import type { GuideDataBlockKey } from '@/lib/guide/data-blocks';
import { getHospitalByType } from '@/lib/guide/blocks/hospital-by-type';
import { getChildcareByType } from '@/lib/guide/blocks/childcare-by-type';
import { getChildcareWaitlist } from '@/lib/guide/blocks/childcare-waitlist';
import { getChargerMix } from '@/lib/guide/blocks/charger-mix';

/** 블록 공용 셸. 제목·표·기준일·출처 캡션을 한 형태로 묶는다. */
function BlockShell({
  title, note, sources, headers, rows, asOf,
}: {
  title: string;
  note: string;
  sources: DataSourceId[];
  headers: string[];
  rows: (string | number)[][];
  asOf: Date | null;
}) {
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
      {asOf && <p className="mt-3 text-xs text-[var(--color-muted)]">데이터 기준일 {formatAsOf(asOf)}</p>}
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

/**
 * 블록 키 → 컴포넌트 매핑. `Record<GuideDataBlockKey, ...>`로 타입을 명시해
 * `lib/guide/data-blocks.ts`의 키 목록과 어긋나면 컴파일 에러가 나도록 한다.
 */
export const GUIDE_DATA_BLOCK_COMPONENTS: Record<GuideDataBlockKey, () => Promise<ReactElement | null>> = {
  'hospital-by-type': HospitalByType,
  'childcare-by-type': ChildcareByType,
  'childcare-waitlist': ChildcareWaitlist,
  'charger-mix': ChargerMix,
};
