import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { SourceCaption } from '@/components/ui/source-caption';
import type { SchoolZoneView, ZoneSchool } from '@/lib/insights/school-zone';

/**
 * 아파트 상세 · 배정 초등학교(학구도). UI 확정본: docs/superpowers/mockups/2026-10-20-school-zone.html
 * 단지 대표 좌표 한 점으로 판정하므로 "배정됩니다"처럼 단정하지 않고, 교육지원청 확인 안내를 항상 둔다.
 */
export function SchoolZoneSection({ view, id }: { view: SchoolZoneView | null; id?: string }) {
  if (!view) return null;
  const v = view;
  const single = v.primary.length === 1;

  return (
    <Card id={id}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-[var(--color-blue-dark)]">배정 초등학교</h2>
        <span className="text-[13px] text-[var(--color-muted)]">학구도 기준일 {v.baseDateLabel}</span>
      </div>

      <p className="mb-1.5 text-[13px] text-[var(--color-muted)]">단지 대표 위치 기준 통학구역</p>
      {single ? (
        <PrimaryCard school={v.primary[0]} zoneName={v.zoneName} />
      ) : (
        <>
          <p className="mb-2.5 text-sm leading-relaxed">
            {v.kindLabel && (
              <span className="mr-1.5 inline-block rounded-full bg-[var(--color-sky-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue-dark)]">
                {v.kindLabel}
              </span>
            )}
            여러 학교가 함께 지정된 구역입니다.
          </p>
          <SchoolList schools={v.primary} />
        </>
      )}

      {v.others.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-[15px] font-bold">광역통학구역으로 함께 지정된 학교</h3>
          <SchoolList schools={v.others} />
        </div>
      )}

      <p className="mt-5 rounded-2xl bg-[var(--color-soft)] px-4 py-3.5 text-sm leading-relaxed">
        통학구역은 교육청이 조정할 수 있고 동·호수에 따라 다를 수 있습니다. 실제 배정 학교는{' '}
        <strong>{v.eduName ?? '관할 교육지원청'}</strong>에 확인하세요.
      </p>

      <div className="mt-4 border-t border-[var(--color-line)] pt-3 text-xs leading-relaxed text-[var(--color-muted)]">
        <p>
          출처: 재단법인 한국지방교육행정연구재단 학구도(기준일 {v.baseDateLabel})
          {v.loadedAtLabel ? ` · ${v.loadedAtLabel} 조회` : ''} · 학구명: {v.zoneName} · 직선거리는 임장ON 계산(단지 대표
          좌표와 학교 위치 사이)
        </p>
        <SourceCaption ids={['kedi-school-zone']} className="mt-1" />
      </div>
    </Card>
  );
}

function PrimaryCard({ school, zoneName }: { school: ZoneSchool; zoneName: string }) {
  const sub = [school.distanceLabel ? `직선거리 ${school.distanceLabel}` : null, zoneName].filter(Boolean).join(' · ');
  const body = (
    <div>
      <p className="text-[20px] font-extrabold text-[var(--color-blue-dark)]">{school.name}</p>
      <p className="mt-0.5 text-[13px] text-[var(--color-muted)]">{sub}</p>
    </div>
  );
  const box = 'flex items-center justify-between gap-3 rounded-2xl bg-[var(--color-soft)] px-[18px] py-4';
  if (!school.href) return <div className={box}>{body}</div>;
  return (
    <Link href={school.href} prefetch={false} className={`${box} transition-colors hover:bg-[var(--color-line)]`}>
      {body}
      <span className="whitespace-nowrap text-sm font-bold text-[var(--color-blue)]">학교 정보 →</span>
    </Link>
  );
}

function SchoolList({ schools }: { schools: ZoneSchool[] }) {
  return (
    <ul className="border-t border-[var(--color-line)]">
      {schools.map((s) => (
        <li key={s.name} className="flex items-center justify-between gap-3 border-b border-[var(--color-soft)] px-0.5 py-3 text-[15px]">
          {s.href ? (
            <Link href={s.href} prefetch={false} className="font-medium hover:text-[var(--color-blue)]">
              {s.name} <span className="font-bold text-[var(--color-blue)]">→</span>
            </Link>
          ) : (
            <span className="font-medium">{s.name}</span>
          )}
          {s.distanceLabel && (
            <span className="whitespace-nowrap text-sm text-[var(--color-muted)]">직선 {s.distanceLabel}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
