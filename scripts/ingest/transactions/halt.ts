/**
 * 거래 수집 정지 상태(S3). 차단기(run-breaker.ts)가 멈추면 정지를 기록하고, 이후 예약 실행(일일·재확인)은 원인을 확인해
 * 운영자가 해제할 때까지 원천을 부르지 않고 바로 끝난다 — 같은 문제가 매일 반복되며 범위를 조금씩 바꾸는 것을 막는다.
 * 일괄 롤백 --apply도 정지 상태에서만 허용해, 롤백 중 수집이 끼어들지 않게 한다.
 *
 * 저장: 기존 IngestionRun 테이블(스키마 변경 없음). source='reconcile-halt'인 가장 최근 행이 targetKey='halt'이면 정지,
 * 'clear'면 해제. 행은 지우지 않아 정지·해제 이력이 남는다. ETL 컨테이너는 디스크가 남지 않아 파일 대신 DB에 둔다.
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export const HALT_SOURCE = 'reconcile-halt';

export interface HaltState {
  active: boolean;
  id?: bigint;
  since?: Date;
  reason?: string;
  detail?: unknown;
}

const parse = (s: string | null): { reason?: string; detail?: unknown } => { try { return JSON.parse(s ?? '{}'); } catch { return { reason: s ?? undefined }; } };
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? String(x) : x));

export async function getHalt(): Promise<HaltState> {
  const last = await prisma.ingestionRun.findFirst({ where: { source: HALT_SOURCE }, orderBy: { id: 'desc' } });
  if (!last || last.targetKey !== 'halt') return { active: false };
  const m = parse(last.errorMessage);
  return { active: true, id: last.id, since: last.startedAt, reason: m.reason, detail: m.detail };
}

/** 정지를 기록한다(이미 정지면 새 사유를 덧붙여 기록). */
export async function setHalt(reason: string, detail?: unknown): Promise<void> {
  if (!reason.trim()) throw new Error('정지 사유가 필요하다');
  await prisma.ingestionRun.create({ data: { source: HALT_SOURCE, targetKey: 'halt', status: 'ERROR', errorMessage: json({ reason, detail }), finishedAt: new Date() } });
  logger.error({ reason, detail: JSON.parse(json(detail ?? null)) }, 'transactions ETL halted');
}

/** 정지를 해제한다. 원인을 확인했다는 사유를 남겨야 한다. */
export async function clearHalt(reason: string): Promise<void> {
  if (!reason.trim()) throw new Error('해제 사유가 필요하다(원인 확인 내용)');
  const h = await getHalt();
  if (!h.active) throw new Error('정지 상태가 아니다');
  await prisma.ingestionRun.create({ data: { source: HALT_SOURCE, targetKey: 'clear', status: 'OK', errorMessage: json({ reason, cleared: String(h.id) }), finishedAt: new Date() } });
  logger.warn({ reason, cleared: String(h.id) }, 'transactions ETL halt cleared');
}
