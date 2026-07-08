'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Chip } from '@/components/ui/chip';
import { FilterSelect } from '@/app/(public)/_components/filter-select';

interface SidoItem { code: string; sido: string; fullName: string; }
interface SigunguItem { code: string; sigungu: string; fullName: string; sigunguCode: string; }

const KINDS = [['all', '전체'], ['elem', '초등'], ['mid', '중등'], ['high', '고등'], ['special', '특수']] as const;
const FOUNDS = [['all', '전체'], ['public', '국공립'], ['private', '사립']] as const;
const COEDUS = [['all', '전체'], ['male', '남'], ['female', '여'], ['co', '공학']] as const;

interface Props {
  basePath: string;
  sidoList?: SidoItem[];
  params?: URLSearchParams;
  onParamsChange?: (next: URLSearchParams) => void;
}

export function SchoolFilterPanel({ basePath, sidoList, params: ext, onParamsChange }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const p = ext ?? sp;
  const get = (k: string, d = 'all') => p.get(k) ?? d;
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

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">학교명</h3>
        <input
          defaultValue={p.get('q') ?? ''}
          onBlur={(e) => update({ q: e.target.value || null })}
          onKeyDown={(e) => { if (e.key === 'Enter') update({ q: (e.target as HTMLInputElement).value || null }); }}
          placeholder="예) 대청중학교"
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

      <FilterGroup title="학교급" k="kind" options={KINDS} get={get} update={update} />
      <FilterGroup title="설립유형" k="found" options={FOUNDS} get={get} update={update} />
      <FilterGroup title="남녀공학" k="coedu" options={COEDUS} get={get} update={update} />
    </div>
  );
}

function FilterGroup({ title, k, options, get, update }: {
  title: string;
  k: string;
  options: readonly (readonly [string, string])[];
  get: (k: string) => string;
  update: (u: Record<string, string | null>) => void;
}) {
  const cur = get(k);
  return (
    <section>
      <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map(([val, label]) => (
          <Chip key={val} active={cur === val} onClick={() => update({ [k]: val === 'all' ? null : val })}>
            {label}
          </Chip>
        ))}
      </div>
    </section>
  );
}
