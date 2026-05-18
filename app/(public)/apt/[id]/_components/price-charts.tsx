'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card } from '@/components/ui/card';

interface Point {
  month: string;
  value: number;
  count: number;
}
interface Props {
  sale: Point[];
  jeonse: Point[];
  wolse: Point[];
}

export function PriceCharts({ sale, jeonse, wolse }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <ChartCard title="매매" color="#2563eb" data={sale} />
      <ChartCard title="전세" color="#0f9f6e" data={jeonse} />
      <ChartCard title="월세 보증금" color="#ef4444" data={wolse} />
    </div>
  );
}

function ChartCard({ title, color, data }: { title: string; color: string; data: Point[] }) {
  return (
    <Card className="!p-4">
      <p className="mb-2 text-sm font-bold text-[var(--color-blue-dark)]">{title}</p>
      {data.length === 0 ? (
        <p className="text-xs text-[var(--color-muted)]">데이터 없음</p>
      ) : (
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={data}>
            <XAxis dataKey="month" hide />
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Tooltip
              labelFormatter={(v) => v as string}
              formatter={(v: unknown) => [`${(Number(v) / 10_000).toFixed(1)}억`, '평균']}
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
