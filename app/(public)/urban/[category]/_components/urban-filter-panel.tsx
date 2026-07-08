'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Chip } from '@/components/ui/chip';
import { FilterSelect } from '@/app/(public)/_components/filter-select';
import type { UrbanCategoryView } from '@/lib/urban/category';

interface SidoItem { code: string; sido: string; fullName: string; }
interface SigunguItem { code: string; sigungu: string; fullName: string; sigunguCode: string; }

interface Props {
  def: UrbanCategoryView;
  basePath: string;
  sidoList?: SidoItem[];
  params?: URLSearchParams;
  onParamsChange?: (next: URLSearchParams) => void;
}

const CHARGE_OPTS = [
  { slug: '', label: '전체' },
  { slug: '무료', label: '무료' },
  { slug: '유료', label: '유료' },
];
const TYPE_OPTS = [
  { slug: '', label: '전체' },
  { slug: '노외', label: '노외' },
  { slug: '노상', label: '노상' },
  { slug: '부설', label: '부설' },
];

export function UrbanFilterPanel({ def, basePath, sidoList, params: ext, onParamsChange }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const p = ext ?? sp;
  const sub = def.subFilters;
  const sido = p.get('sido');
  const region = p.get('region');
  const charge = p.get('charge') ?? '';
  const type = p.get('type') ?? '';
  const pwd = p.get('pwd') === 'on';
  const open24 = p.get('open24') === 'on';

  const [sigunguList, setSigunguList] = useState<SigunguItem[]>([]);
  useEffect(() => {
    if (!sido) { setSigunguList([]); return; }
    fetch(`/api/regions?sido=${encodeURIComponent(sido)}`)
      .then((r) => r.json())
      .then((d: SigunguItem[]) => setSigunguList(d))
      .catch(() => setSigunguList([]));
  }, [sido]);

  function update(updates: Record<string, string | null>) {
    const next = new URLSearchParams(p.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) next.delete(k); else next.set(k, v);
    }
    next.delete('page');
    if (onParamsChange) onParamsChange(next);
    else router.push(`${basePath}?${next.toString()}`);
  }

  const subKey = sub?.paramKey ?? 'sub';
  const subCur = sub ? (p.get(subKey) ?? sub.defaultSlug) : null;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">{def.label} 이름</h3>
        <input
          defaultValue={p.get('q') ?? ''}
          onBlur={(e) => update({ q: e.target.value || null })}
          onKeyDown={(e) => { if (e.key === 'Enter') update({ q: (e.target as HTMLInputElement).value || null }); }}
          placeholder={`예) ${def.label} 검색`}
          className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-2 text-sm"
        />
      </section>

      {sidoList && (
        <section>
          <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">지역</h3>
          <div className="mt-2 flex flex-col gap-2">
            <FilterSelect value={sido ?? ''} onChange={(e) => update({ sido: e.target.value || null, region: null })}>
              <option value="">시도 전체</option>
              {sidoList.map((s) => <option key={s.code} value={s.sido}>{s.fullName}</option>)}
            </FilterSelect>
            {sigunguList.length > 0 && (
              <FilterSelect value={region ?? ''} onChange={(e) => update({ region: e.target.value || null })}>
                <option value="">시군구 전체</option>
                {sigunguList.map((sg) => <option key={sg.code} value={sg.sigunguCode}>{sg.sigungu}</option>)}
              </FilterSelect>
            )}
          </div>
        </section>
      )}

      {sub && (
        <section>
          <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">{sub.label ?? '운영 형태'}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {sub.options.map((opt) => (
              <Chip key={opt.slug} active={subCur === opt.slug}
                onClick={() => update({ [subKey]: opt.slug === sub.defaultSlug ? null : opt.slug })}>
                {opt.label}
              </Chip>
            ))}
          </div>
        </section>
      )}

      {def.slug === 'parking' && (
        <>
          <section>
            <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">요금</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {CHARGE_OPTS.map((opt) => (
                <Chip key={opt.label} active={charge === opt.slug}
                  onClick={() => update({ charge: opt.slug || null })}>
                  {opt.label}
                </Chip>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">주차장 종류</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {TYPE_OPTS.map((opt) => (
                <Chip key={opt.label} active={type === opt.slug}
                  onClick={() => update({ type: opt.slug || null })}>
                  {opt.label}
                </Chip>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">부가</h3>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={pwd} onChange={(e) => update({ pwd: e.target.checked ? 'on' : null })} />
              ♿ 장애인전용 구획 있음
            </label>
            <label className="mt-1 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={open24} onChange={(e) => update({ open24: e.target.checked ? 'on' : null })} />
              ⏰ 24시간 운영 (평일 기준)
            </label>
          </section>
        </>
      )}
    </div>
  );
}
