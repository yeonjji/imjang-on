import Link from 'next/link';

interface SigunguRef {
  sido: string;
  sigungu: string | null;
  sigunguCode: string | null;
}

// /school 하단 SEO·탐색용 내부 링크 블록 — 시도별 시군구 학교 페이지로 연결한다.
export function RegionLinks({ sigungus }: { sigungus: SigunguRef[] }) {
  const bySido = new Map<string, SigunguRef[]>();
  for (const s of sigungus) {
    if (!s.sigunguCode || !s.sigungu) continue;
    const arr = bySido.get(s.sido) ?? [];
    arr.push(s);
    bySido.set(s.sido, arr);
  }
  if (bySido.size === 0) return null;

  return (
    <section className="mt-12 border-t border-[var(--color-line)] pt-8">
      <h2 className="mb-5 text-lg font-bold text-[var(--color-blue-dark)]">지역별 학교 찾기</h2>
      <div className="flex flex-col gap-5">
        {[...bySido.entries()].map(([sido, list]) => (
          <div key={sido}>
            <h3 className="mb-2 text-sm font-bold text-[var(--color-blue-dark)]">{sido}</h3>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
              {list.map((sg) => (
                <Link
                  key={sg.sigunguCode}
                  href={`/school/${sg.sigunguCode}`}
                  className="text-sm text-[var(--color-muted)] hover:text-[var(--color-blue)]"
                >
                  {sg.sigungu}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
