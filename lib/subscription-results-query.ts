import { prisma } from '@/lib/db';
import { kstDate } from '@/lib/insights/maintenance-cost';
import { buildResultsView, type SubscriptionResultsData } from '@/lib/insights/subscription-results';

/** 청약 상세 청약 결과. 수집 결과가 있는(status='ok') 공고만, 표시할 행이 없으면 null. */
export async function getSubscriptionResults(noticeId: bigint, category: string): Promise<SubscriptionResultsData | null> {
  const r = await prisma.subscriptionResult.findUnique({ where: { noticeId } });
  if (!r || r.status !== 'ok') return null;
  const view = buildResultsView(category, r.competition, r.scores, r.special);
  return view ? { view, fetchedLabel: kstDate(r.fetchedAt) } : null;
}
