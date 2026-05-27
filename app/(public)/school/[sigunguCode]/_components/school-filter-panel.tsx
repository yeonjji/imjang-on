'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Chip } from '@/components/ui/chip';

const KINDS = [['all','전체'],['elem','초등'],['mid','중등'],['high','고등'],['special','특수']] as const;
const FOUNDS = [['all','전체'],['public','국공립'],['private','사립']] as const;
const COEDUS = [['all','전체'],['male','남'],['female','여'],['co','공학']] as const;

interface Props {
  basePath: string;
  params?: URLSearchParams;
  onParamsChange?: (next: URLSearchParams) => void;
}

export function SchoolFilterPanel({ basePath, params: ext, onParamsChange }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const p = ext ?? sp;
  const get = (k: string, d = 'all') => p.get(k) ?? d;

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
