'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Chip } from '@/components/ui/chip';
import type { AmenityCategoryDef } from '@/lib/amenity/category';

interface SidoItem { code: string; sido: string; fullName: string; }
interface SigunguItem { code: string; sigungu: string; fullName: string; sigunguCode: string; }

interface Props {
  def: AmenityCategoryDef;
  basePath: string;
  sidoList?: SidoItem[];
  params?: URLSearchParams;
  onParamsChange?: (next: URLSearchParams) => void;
}

export function AmenityFilterPanel({ def, basePath, sidoList, params: ext, onParamsChange }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const p = ext ?? sp;
  const sub = def.subFilters;
  const sido = p.get('sido');
  const region = p.get('region');

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
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    next.delete('page');
    if (onParamsChange) onParamsChange(next);
    else router.push(`${basePath}?${next.toString()}`);
  }

  const selectCls = 'w-full rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-blue-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue)]';

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
          placeholder={`예) ${def.label}명`}
          className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-2 text-sm"
        />
      </section>

      {sidoList && (
        <section>
          <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">지역</h3>
          <div className="mt-2 flex flex-col gap-2">
            <select value={sido ?? ''} onChange={(e) => update({ sido: e.target.value || null, region: null })} className={selectCls}>
              <option value="">시도 전체</option>
              {sidoList.map((s) => <option key={s.code} value={s.sido}>{s.fullName}</option>)}
            </select>
            {sigunguList.length > 0 && (
              <select value={region ?? ''} onChange={(e) => update({ region: e.target.value || null })} className={selectCls}>
                <option value="">시군구 전체</option>
                {sigunguList.map((sg) => <option key={sg.code} value={sg.sigunguCode}>{sg.sigungu}</option>)}
              </select>
            )}
          </div>
        </section>
      )}

      {sub && (
        <section>
          <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">{def.label} 종류</h3>
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
    </div>
  );
}
