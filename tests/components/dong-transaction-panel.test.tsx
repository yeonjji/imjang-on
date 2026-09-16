import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import {
  DongTransactionPanel,
  pickFirstSigungu,
  pickFirstDong,
  buildDongTransactionsQuery,
  type SidoItem,
  type SigunguItem,
} from '@/app/(public)/_components/dong-transaction-panel';
import type { DongTransaction } from '@/lib/transaction/dong';
import type { DongOption } from '@/lib/dong-options';

(globalThis as unknown as { React: typeof React }).React = React;

const SIDO_LIST: SidoItem[] = [
  { code: '1100000000', sido: '서울', fullName: '서울특별시' },
  { code: '4100000000', sido: '경기', fullName: '경기도' },
];

const ITEMS: DongTransaction[] = [
  {
    id: '1', contractDate: '2026-09-09', propertyId: '10',
    propertyName: '올림픽훼밀리타운', propertyType: 'APARTMENT',
    exclusiveArea: 84.12, floor: 11, dealType: 'JEONSE',
    dealAmount: null, deposit: 95000, monthlyRent: null,
  },
  {
    id: '2', contractDate: '2019-03-04', propertyId: '11',
    propertyName: '문정래미안', propertyType: 'APARTMENT',
    exclusiveArea: 115, floor: null, dealType: 'WOLSE',
    dealAmount: null, deposit: 5000, monthlyRent: 150,
  },
];

const html = (items: DongTransaction[]) =>
  renderToStaticMarkup(
    <DongTransactionPanel
      initialSido="서울"
      initialSigunguCode="11710"
      initialSigunguName="송파구"
      initialUmd="문정동"
      initialDongs={[{ umd: '가락동', txCount: 100 }, { umd: '문정동', txCount: 300 }]}
      initialItems={items}
      sidoList={SIDO_LIST}
    />,
  );

describe('DongTransactionPanel', () => {
  it('제목과 초기 지역을 보여준다', () => {
    const out = html(ITEMS);
    expect(out).toContain('동네별 최근 실거래가');
    expect(out).toContain('문정동');
  });

  it('건물유형과 거래유형 선택지를 보여준다', () => {
    const out = html(ITEMS);
    expect(out).toContain('아파트');
    expect(out).toContain('전체');
    expect(out).toContain('매매');
    expect(out).toContain('전세');
    expect(out).toContain('월세');
  });

  it('날짜에 연도를 표기한다', () => {
    const out = html(ITEMS);
    expect(out).toContain('26.09.09');
    expect(out).toContain('19.03.04');
  });

  it('월세를 라벨과 함께 쓴다', () => {
    expect(html(ITEMS)).toContain('보 5,000만원 / 월 150만');
  });

  it('층이 없으면 그 조각을 생략한다', () => {
    const out = html(ITEMS);
    expect(out).toContain('84㎡ · 11층 · 26.09.09');
    expect(out).toContain('115㎡ · 19.03.04');
  });

  // 홈 패널은 0건이어도 사라지지 않는다. 필터를 눌렀는데 패널이 없어지면
  // 사용자는 고장으로 받아들인다.
  it('0건이어도 패널과 필터가 남고 안내를 보여준다', () => {
    const out = html([]);
    expect(out).toContain('동네별 최근 실거래가');
    expect(out).toContain('이 조건에 해당하는 거래가 없습니다');
  });

  it('「더 보기」 링크를 두지 않는다', () => {
    const out = html(ITEMS);
    expect(out).not.toContain('더 보기');
    expect(out).not.toContain('전체 보기');
    expect(out).not.toContain('매물 보기');
  });
});

// 시도 → 시군구 → 동 캐스케이드의 리셋·자동선택 로직. 렌더 상호작용은 이 저장소
// 테스트 환경(@testing-library 없음)으로 재현할 수 없어, 그 로직을 뽑아낸 순수
// 함수를 직접 검증한다. 컴포넌트는 이 함수들의 반환값으로 상태를 갱신한다.
describe('지역 캐스케이드 로직', () => {
  const SIGUNGU_LIST: SigunguItem[] = [
    { code: 'a', sigungu: '강남구', fullName: '서울특별시 강남구', sigunguCode: '11680' },
    { code: 'b', sigungu: '송파구', fullName: '서울특별시 송파구', sigunguCode: '11710' },
  ];
  const DONG_LIST: DongOption[] = [
    { umd: '가락동', txCount: 100 },
    { umd: '문정동', txCount: 300 },
  ];

  it('시군구 목록이 도착하면 첫 항목(가나다순 1번)을 고른다', () => {
    expect(pickFirstSigungu(SIGUNGU_LIST)).toEqual(SIGUNGU_LIST[0]);
  });

  it('시군구 목록이 비어 있으면(=시도 전환 직후) 선택 없음이다', () => {
    expect(pickFirstSigungu([])).toBeNull();
  });

  it('동 목록이 도착하면 첫 항목을 고른다', () => {
    expect(pickFirstDong(DONG_LIST)).toEqual(DONG_LIST[0]);
  });

  it('동 목록이 비어 있으면(=시군구 전환 직후) 선택 없음이다 — 이전 시군구의 동이 남지 않는다', () => {
    expect(pickFirstDong([])).toBeNull();
  });

  it('시군구·동이 모두 정해지면 조회 쿼리를 만든다', () => {
    const q = buildDongTransactionsQuery({
      sigunguCode: '11710', umd: '문정동', propertyType: 'APARTMENT', deal: 'ALL',
    });
    expect(q).toContain('sigunguCode=11710');
    expect(q).toContain('umd=%EB%AC%B8%EC%A0%95%EB%8F%99');
    expect(q).not.toContain('dealType');
  });

  it('거래유형을 특정하면 쿼리에 dealType을 싣는다', () => {
    const q = buildDongTransactionsQuery({
      sigunguCode: '11710', umd: '문정동', propertyType: 'APARTMENT', deal: 'JEONSE',
    });
    expect(q).toContain('dealType=JEONSE');
  });

  it('시군구가 비어 있으면(캐스케이드 전환 중) 쿼리를 만들지 않는다', () => {
    expect(
      buildDongTransactionsQuery({ sigunguCode: '', umd: '문정동', propertyType: 'APARTMENT', deal: 'ALL' }),
    ).toBeNull();
  });

  it('동이 비어 있으면(캐스케이드 전환 중) 쿼리를 만들지 않는다', () => {
    expect(
      buildDongTransactionsQuery({ sigunguCode: '11710', umd: '', propertyType: 'APARTMENT', deal: 'ALL' }),
    ).toBeNull();
  });
});
