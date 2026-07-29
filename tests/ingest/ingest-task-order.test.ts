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

  // doneKeys는 (source, sgg, yyyymm) 조합별로 독립 필터링되므로, 이전 --limit 실행이
  // 한 달의 일부만 완료했다면 월별 생존 시군구 집합이 비대칭이 되어 월 경계에서
  // 우연히 같은 시군구가 인접할 수 있다. dedupeAdjacentSgg가 이를 재배치로 없애야 한다.
  it('doneKeys로 월별 생존 시군구가 비대칭이어도 인접 쌍은 같은 시군구를 갖지 않는다', () => {
    const done = new Set(['MOLIT_APT_TRADE:11140-202601', 'MOLIT_APT_TRADE:11170-202601']);
    const keys = buildIngestTaskKeys(API, ['202601', '202602'], ['11110', '11140', '11170'], done);
    expect(keys).toHaveLength(4);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i].sgg).not.toBe(keys[i - 1].sgg);
    }
  });

  // 같은 비대칭 생존 패턴이 api 경계에서도 나타날 수 있다 — doneKeys 키에 source가
  // 포함되므로 api별로 독립적으로 걸러진다.
  it('doneKeys로 api별 생존 시군구가 비대칭이어도 api 경계에서 인접 쌍은 같은 시군구를 갖지 않는다', () => {
    const apis = [
      { api: 'aptTrade', source: 'MOLIT_APT_TRADE' },
      { api: 'aptRent', source: 'MOLIT_APT_RENT' },
    ];
    const done = new Set(['MOLIT_APT_TRADE:11140-202601', 'MOLIT_APT_TRADE:11170-202601']);
    const keys = buildIngestTaskKeys(apis, ['202601'], ['11110', '11140', '11170'], done);
    expect(keys).toHaveLength(4);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i].sgg).not.toBe(keys[i - 1].sgg);
    }
  });

  // 재배치는 순서만 바꿀 뿐 항목을 버리거나 복제해서는 안 된다.
  it('재배치 후에도 원본과 동일한 멀티셋을 유지한다 (드롭·중복 없음)', () => {
    const done = new Set(['MOLIT_APT_TRADE:11140-202601', 'MOLIT_APT_TRADE:11170-202601']);
    const keys = buildIngestTaskKeys(API, ['202601', '202602'], ['11110', '11140', '11170'], done);
    const composed = keys.map((k) => `${k.source}:${k.sgg}-${k.yyyymm}`).sort();
    expect(composed).toEqual([
      'MOLIT_APT_TRADE:11110-202601',
      'MOLIT_APT_TRADE:11110-202602',
      'MOLIT_APT_TRADE:11140-202602',
      'MOLIT_APT_TRADE:11170-202602',
    ].sort());
  });

  // 재실행마다 순서가 흔들리면 재현이 안 된다 — 같은 입력엔 항상 같은 출력이어야 한다.
  it('같은 입력을 두 번 호출해도 동일한 순서를 낸다 (결정성)', () => {
    const done = new Set(['MOLIT_APT_TRADE:11140-202601', 'MOLIT_APT_TRADE:11170-202601']);
    const first = buildIngestTaskKeys(API, ['202601', '202602'], ['11110', '11140', '11170'], done);
    const second = buildIngestTaskKeys(API, ['202601', '202602'], ['11110', '11140', '11170'], done);
    expect(second).toEqual(first);
  });
});
