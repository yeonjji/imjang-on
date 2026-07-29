import { describe, it, expect } from 'vitest';
import { buildIngestTaskKeys } from '@/scripts/ingest/transactions/runner';

const API = [{ api: 'aptTrade', source: 'MOLIT_APT_TRADE' }];

describe('buildIngestTaskKeys', () => {
  // 핵심 계약: runWithLimit(…, 2)가 동시에 돌리는 인접 두 태스크가 같은 시군구면
  // 같은 단지를 동시에 생성하는 경합이 난다. 시군구가 2개 이상이면 인접 쌍은 항상 달라야 한다.
  it('인접 태스크는 서로 다른 시군구를 갖는다', () => {
    const keys = buildIngestTaskKeys(API, ['202601', '202602'], ['11110', '11140', '11170'], new Set());
    expect(keys).toHaveLength(6);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i].sgg).not.toBe(keys[i - 1].sgg);
    }
  });

  // 월 경계에서도 깨지지 않아야 한다 — 이전 달 마지막 시군구 vs 다음 달 첫 시군구
  it('월이 바뀌는 지점에서도 시군구가 겹치지 않는다', () => {
    const keys = buildIngestTaskKeys(API, ['202601', '202602'], ['11110', '11140'], new Set());
    expect(keys.map((k) => `${k.yyyymm}:${k.sgg}`)).toEqual([
      '202601:11110', '202601:11140',
      '202602:11110', '202602:11140',
    ]);
    expect(keys[2].sgg).not.toBe(keys[1].sgg);
  });

  it('doneKeys에 있는 조합은 제외한다', () => {
    const done = new Set(['MOLIT_APT_TRADE:11110-202601']);
    const keys = buildIngestTaskKeys(API, ['202601'], ['11110', '11140'], done);
    expect(keys).toHaveLength(1);
    expect(keys[0].sgg).toBe('11140');
  });

  it('api가 여럿이면 api별로 전체 조합을 낸다', () => {
    const apis = [
      { api: 'aptTrade', source: 'MOLIT_APT_TRADE' },
      { api: 'aptRent', source: 'MOLIT_APT_RENT' },
    ];
    const keys = buildIngestTaskKeys(apis, ['202601'], ['11110', '11140'], new Set());
    expect(keys).toHaveLength(4);
    expect(keys.slice(0, 2).every((k) => k.source === 'MOLIT_APT_TRADE')).toBe(true);
  });

  // 알려진 한계: 시군구가 1개뿐이면 순서로는 못 막는다. 스펙 §4.1의 P2002 재조회(C)가 받는다.
  it('시군구가 1개면 인접 태스크가 같은 시군구다 (한계 문서화)', () => {
    const keys = buildIngestTaskKeys(API, ['202601', '202602'], ['11110'], new Set());
    expect(keys[0].sgg).toBe(keys[1].sgg);
  });
});
