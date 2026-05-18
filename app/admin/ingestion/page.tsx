import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function IngestionAdminPage() {
  const runs = await prisma.ingestionRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: 100,
  });

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-12">
      <h1 className="text-2xl font-bold">최근 ETL 실행</h1>
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-[var(--color-muted)]">
            <th>ID</th>
            <th>Source</th>
            <th>Target</th>
            <th>Status</th>
            <th>Rows</th>
            <th>Started</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={String(r.id)} className="border-t border-[var(--color-line)]">
              <td className="py-1.5">{String(r.id)}</td>
              <td>{r.source}</td>
              <td>{r.targetKey}</td>
              <td className={r.status === 'ERROR' ? 'text-red-600' : ''}>{r.status}</td>
              <td>{r.rowsUpserted}</td>
              <td>{r.startedAt.toISOString().slice(0, 19).replace('T', ' ')}</td>
              <td className="text-xs text-red-600">{r.errorMessage?.slice(0, 60)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
