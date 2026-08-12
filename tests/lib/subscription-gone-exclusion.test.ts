import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// GONE_SUBSCRIPTION_IDS는 lib/subscription.ts 모듈 최상위에서 딱 한 번 bigint[]로 변환된다
// (GONE_SUBSCRIPTION_ID_LIST) — 그래서 이 값은 lib/subscription을 처음 import하기 전에 이미
// 고정돼 있어야 한다. vi.mock 팩토리는 파일 맨 위로 호이스팅되므로, 팩토리가 참조할 id도
// vi.hoisted로 함께 끌어올린다(guide-publish-action.test.ts와 같은 관례).
const { GONE_ID, LIVE_ID } = vi.hoisted(() => ({
  GONE_ID: 999999101n,
  LIVE_ID: 999999102n,
}));

vi.mock('@/lib/subscription/gone-ids', () => ({
  GONE_SUBSCRIPTION_IDS: new Set([String(GONE_ID)]),
  GONE_IDS_GENERATED_AT: '2026-08-12',
}));

import { prisma } from '@/lib/db';
import {
  getSubscriptionList,
  getWeeklySubscriptions,
  getHomeWeekBoard,
  getNearbySubscriptions,
} from '@/lib/subscription';

// 실제 지역명·실거래 데이터와 절대 겹치지 않을 sentinel(median-snapshot 테스트의 88881/88882
// 관례를 그대로 따름). today를 실제 현재 시각과 무관한 미래로 고정해, 이 테이블에 아무도 데이터를
// 심지 않는 로컬 테스트 DB에서도 주간 보드의 "하루 상위 3건" 슬라이스에 다른 데이터가 섞여
// 들어올 걱정 없이 완전히 격리된 상태로 검증한다.
const REGION_NAME = 'GONE-EXCLUDE-TEST-SIDO';
const TODAY = new Date('2099-06-15T00:00:00.000Z');
const RECEIPT_BEGIN = new Date('2099-06-13T00:00:00.000Z'); // TODAY±3일 주간 안
const RECEIPT_END = new Date('2099-06-17T00:00:00.000Z');

describe('청약 조회 4종 — GONE_SUBSCRIPTION_IDS 제외 (Fix A)', () => {
  beforeAll(async () => {
    // gone: 실제 410 대상과 같은 상태(location 없음) + 모킹한 GONE_SUBSCRIPTION_IDS에 포함된 id.
    await prisma.subscriptionNotice.create({
      data: {
        id: GONE_ID,
        source: 'APPLYHOME',
        category: 'APT',
        sourceKey: `gone-exclude-test-${GONE_ID}`,
        name: 'GONE-EXCLUDE-TEST-공고-좌표없음',
        regionName: REGION_NAME,
        address: `${REGION_NAME} 어딘가`,
        receiptBegin: RECEIPT_BEGIN,
        receiptEnd: RECEIPT_END,
        rawJson: {},
      },
    });
    // live: 좌표 있음 + GONE_SUBSCRIPTION_IDS에 없는 id — 제외되지 않아야 하는 대조군.
    await prisma.subscriptionNotice.create({
      data: {
        id: LIVE_ID,
        source: 'APPLYHOME',
        category: 'APT',
        sourceKey: `gone-exclude-test-${LIVE_ID}`,
        name: 'GONE-EXCLUDE-TEST-공고-좌표있음',
        regionName: REGION_NAME,
        address: `${REGION_NAME} 어딘가`,
        receiptBegin: RECEIPT_BEGIN,
        receiptEnd: RECEIPT_END,
        rawJson: {},
      },
    });
    // location(Unsupported geography)은 Prisma Client select/write 대상이 아니라 raw SQL로 채운다
    // — scripts/ingest/subscriptions/geocode-fill.ts와 같은 패턴.
    await prisma.$executeRaw`
      UPDATE "SubscriptionNotice"
      SET location = ST_SetSRID(ST_MakePoint(127.0, 37.5), 4326)::geography
      WHERE id = ${LIVE_ID}
    `;
  });

  afterAll(async () => {
    await prisma.subscriptionNotice.deleteMany({ where: { id: { in: [GONE_ID, LIVE_ID] } } });
  });

  it('getSubscriptionList: gone id는 빠지고 live id는 남는다', async () => {
    const { rows } = await getSubscriptionList({ sido: REGION_NAME, perPage: 50 });
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain(String(GONE_ID));
    expect(ids).toContain(String(LIVE_ID));
  });

  it('getWeeklySubscriptions: gone id는 빠지고 live id는 남는다', async () => {
    const board = await getWeeklySubscriptions(TODAY);
    const ids = board.days.flatMap((d) => d.items.map((i) => i.id));
    expect(ids).not.toContain(String(GONE_ID));
    expect(ids).toContain(String(LIVE_ID));
  });

  it('getHomeWeekBoard: gone id는 빠지고 live id는 남는다', async () => {
    const model = await getHomeWeekBoard(TODAY);
    const ids = model.days.flatMap((d) => d.items.map((i) => i.id));
    expect(ids).not.toContain(String(GONE_ID));
    expect(ids).toContain(String(LIVE_ID));
  });

  it('getNearbySubscriptions: gone id는 빠지고 live id는 남는다', async () => {
    const { items } = await getNearbySubscriptions({ sido: REGION_NAME, sigungu: null, limit: 50 });
    const ids = items.map((i) => i.id);
    expect(ids).not.toContain(String(GONE_ID));
    expect(ids).toContain(String(LIVE_ID));
  });
});
