import type { GuideDataBlockKey } from '@/lib/guide/data-blocks';

/** 제거 대상 섹션 제목. 본문 Q&A는 본문을 되풀이할 뿐이라 정보 이득이 없다. */
export const FAQ_HEADING = '## 자주 묻는 질문';

export interface GuideBlockPlacement {
  /** 대상 가이드 */
  dedupeKey: string;
  /** 끼워 넣을 블록 */
  blockKey: GuideDataBlockKey;
  /** 이 소제목 섹션의 끝에 넣는다. 못 찾으면 그 편은 건너뛴다. */
  anchorHeading: string;
}

/**
 * 블록이 증명하는 주장이 실제로 어느 소제목 아래 있는지 운영 본문을 확인해 확정했다(2026-08-10).
 *
 * `floor-premium`은 구현돼 있지만 여기 없다. 들어갈 자리인 `realestate-read-transaction-price`에
 * `price-trend-24m`이 이미 가고, 그 편 본문이 2,094자라 표 두 개를 받치지 못한다. 층을 다루는
 * 가이드가 생기거나 그 편 본문이 늘어난 뒤에 넣는다.
 *
 * `childcare-waitlist`(→ `childcare-admission-waiting-process`)는 보류한다. 이 블록은 지역명을
 * 그대로 노출하는데 Childcare.sigungu가 2026-07-01 인천 구 재편을 반영하지 않아 상위 10곳에
 * **지금은 없는 행정구역 `인천광역시 서구(구)`**가 들어간다(주소는 이미 검단구·서해구). 경기도
 * 일반구도 `성남시분당구`처럼 띄어쓰기가 빠져 있다. 지역 라벨을 정리한 뒤 이 표에 추가한다.
 */
export const GUIDE_BLOCK_PLACEMENTS: readonly GuideBlockPlacement[] = [
  {
    dedupeKey: 'medical-hospital-tiers',
    blockKey: 'hospital-by-type',
    anchorHeading: '## 의료기관 종별 구분 기준 알아보기',
  },
  {
    dedupeKey: 'childcare-types-and-choosing',
    blockKey: 'childcare-by-type',
    anchorHeading: '## 어린이집 유형별 차이와 특징',
  },
  {
    dedupeKey: 'life-ev-charger-access',
    blockKey: 'charger-mix',
    anchorHeading: '## 완속·급속 충전 방식, 무엇이 다를까?',
  },
  {
    dedupeKey: 'realestate-read-transaction-price',
    blockKey: 'price-trend-24m',
    anchorHeading: '## 실거래가를 제대로 읽는 방법',
  },
  {
    dedupeKey: 'realestate-area-pyeong-explained',
    blockKey: 'area-price',
    anchorHeading: '## ㎡와 평, 어떻게 계산할까?',
  },
  {
    dedupeKey: 'life-subway-access',
    blockKey: 'subway-premium',
    anchorHeading: '## 역세권 판단 기준: 도보 거리, 환승, 노선 다양성',
  },
  {
    dedupeKey: 'finance-ltv-dsr-mortgage-regulation',
    blockKey: 'ltv-by-region',
    anchorHeading: '## 주택담보대출 한도는 어떻게 정해지나요?',
  },
  {
    dedupeKey: 'school-highschool-types',
    blockKey: 'school-highschool-types',
    anchorHeading: '## 고등학교 유형, 어떻게 다를까요?',
  },
  {
    dedupeKey: 'medical-find-hospital-by-specialty',
    blockKey: 'hospital-by-dept',
    anchorHeading: '## 병원·진료과목 찾는 단계별 방법',
  },
  {
    dedupeKey: 'medical-public-health-center',
    blockKey: 'public-health-centers',
    anchorHeading: '## 보건소·보건지소란?',
  },
  {
    dedupeKey: 'subscription-special-supply-types',
    blockKey: 'special-supply-mix',
    anchorHeading: '## 특별공급이란? 주요 유형과 대상',
  },
  {
    dedupeKey: 'finance-policy-housing-loans',
    blockKey: 'housing-loan-products',
    anchorHeading: '## 주요 상품별 자격과 이용 구조',
  },
  {
    dedupeKey: 'life-infra-checklist',
    blockKey: 'infra-inventory',
    anchorHeading: '## 생활 인프라란 무엇일까?',
  },
];

function isHeading2(line: string): boolean {
  return line.startsWith('## ');
}

/** `## 자주 묻는 질문` 헤딩부터 다음 `## ` 직전까지 지운다. 그 뒤 섹션은 보존한다. */
export function removeFaqSection(body: string): { body: string; removed: boolean } {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => l.trim() === FAQ_HEADING);
  if (start === -1) return { body, removed: false };

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (isHeading2(lines[i])) {
      end = i;
      break;
    }
  }
  const kept = [...lines.slice(0, start), ...lines.slice(end)];
  return { body: kept.join('\n'), removed: true };
}

export type InsertSkipReason = 'already-present' | 'anchor-not-found';

/** 앵커 소제목 섹션의 끝(다음 `## ` 직전)에 `[[data:<키>]]` 한 줄을 넣는다. 멱등. */
export function insertBlockMarker(
  body: string,
  anchorHeading: string,
  blockKey: GuideDataBlockKey,
): { body: string; inserted: boolean; reason?: InsertSkipReason } {
  const marker = `[[data:${blockKey}]]`;
  const lines = body.split('\n');
  if (lines.some((l) => l.trim() === marker)) return { body, inserted: false, reason: 'already-present' };

  const start = lines.findIndex((l) => l.trim() === anchorHeading);
  if (start === -1) return { body, inserted: false, reason: 'anchor-not-found' };

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (isHeading2(lines[i])) {
      end = i;
      break;
    }
  }
  // 섹션 끝의 빈 줄을 걷어내고 마커를 붙인 뒤 빈 줄 하나로 다음 섹션과 띄운다.
  let tail = end;
  while (tail > start + 1 && lines[tail - 1].trim() === '') tail--;

  const next = [...lines.slice(0, tail), '', marker, '', ...lines.slice(end)];
  return { body: next.join('\n'), inserted: true };
}

export interface GuideBodyEditResult {
  body: string;
  faqRemoved: boolean;
  blockInserted: boolean;
  skipReason?: InsertSkipReason;
}

/**
 * 한 편에 대한 본문 수정 = FAQ 제거 + 블록 표식 삽입.
 * 앵커를 못 찾으면 본문을 **전혀 건드리지 않는다** — 표식 없이 FAQ만 지우면 그 편은 손해만 본다.
 */
export function applyGuideBodyEdit(body: string, placement: GuideBlockPlacement): GuideBodyEditResult {
  const ins = insertBlockMarker(body, placement.anchorHeading, placement.blockKey);
  if (ins.reason === 'anchor-not-found') {
    return { body, faqRemoved: false, blockInserted: false, skipReason: ins.reason };
  }
  const faq = removeFaqSection(ins.body);
  return {
    body: faq.body,
    faqRemoved: faq.removed,
    blockInserted: ins.inserted,
    skipReason: ins.reason,
  };
}
