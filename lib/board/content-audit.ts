/**
 * board 글 검수용 순수 검사기. 렌더 결과를 바꾸지 않고 "게시된 글이 스스로 모순되는가"만
 * 본다. 사람이 돌리는 로컬 스크립트(`scripts/board/audit-content.ts`)와 단위 테스트에서 쓴다.
 *
 * 검사 대상은 실제로 사고가 났던 두 가지다.
 *  1) 링크 — GFM 자동 링크는 본문의 맨 URL을 뒤 글자까지 빨아들인다.
 *     `인터넷청약시스템(www.i-sh.co.kr/app)에서` → `http://www.i-sh.co.kr/app)에서`.
 *     닫는 괄호가 짝이 없다는 점이 이 사고의 지문이라 `unbalanced-paren`으로 잡는다.
 *  2) 합계 — 생성 모델이 열거한 숫자와 스스로 적은 합계가 어긋난다.
 */
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { decodeEntities } from '@/lib/text/decode-entities';
import { canonicalizeSourceName } from '@/lib/board/source-name';

/**
 * board 상세 페이지(`app/(public)/board/[id]/page.tsx`)와 같은 remark 설정.
 * 검사기가 실제 렌더와 다른 결과를 보면 의미가 없으므로 값이 바뀌면 함께 맞춰야 한다.
 */
const REMARK_PLUGINS: ComponentProps<typeof Markdown>['remarkPlugins'] = [
  [remarkGfm, { singleTilde: false }],
];

export type LinkIssue =
  /** URL에 공백이 있다(호스트가 깨진다). */
  | 'whitespace'
  /** URL로 파싱되지 않는다. */
  | 'unparseable'
  /** http/https가 아니다. */
  | 'non-http-scheme'
  /** 호스트가 ASCII 도메인이 아니거나 punycode로 변환됐다. */
  | 'bad-host'
  /** 경로·쿼리의 괄호 짝이 맞지 않는다(자동 링크가 뒤 글자를 삼킨 흔적). */
  | 'unbalanced-paren';

export interface LinkFinding {
  href: string;
  issue: LinkIssue;
}

/** 퍼센트 인코딩을 풀되, 잘못된 시퀀스면 원문을 그대로 쓴다. */
function safeDecode(href: string): string {
  try {
    return decodeURI(href);
  } catch {
    return href;
  }
}

/**
 * 마크다운을 board 상세와 같은 설정으로 렌더해 `<a href>` 값을 뽑는다.
 * 렌더된 속성값은 비ASCII가 퍼센트 인코딩돼 있으므로(`/app)에서` → `/app)%EC%97%90%EC%84%9C`)
 * 사람이 읽을 수 있게 디코딩해 돌려준다.
 */
export function extractHrefs(markdown: string): string[] {
  const html = renderToStaticMarkup(
    createElement(Markdown, { remarkPlugins: REMARK_PLUGINS }, markdown),
  );
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => safeDecode(decodeEntities(m[1])));
}

/** 단일 URL 값 검사. 마크다운 밖의 값(예: LoanProduct.rawJson.rltsite)에도 쓸 수 있다. */
export function auditUrl(href: string): LinkIssue | null {
  // 내부 상대경로(/list, #anchor)는 외부 링크 검사 대상이 아니다.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^www\./i.test(href)) return null;

  const decoded = safeDecode(href);
  if (/\s/.test(decoded)) return 'whitespace';

  let url: URL;
  try {
    url = new URL(/^www\./i.test(decoded) ? `https://${decoded}` : decoded);
  } catch {
    return 'unparseable';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'non-http-scheme';
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname)) return 'bad-host';
  if (url.hostname.includes('xn--') && !decoded.toLowerCase().includes('xn--')) return 'bad-host';

  const tail = `${url.pathname}${url.search}${url.hash}`;
  const opens = (tail.match(/\(/g) ?? []).length;
  const closes = (tail.match(/\)/g) ?? []).length;
  if (closes > opens) return 'unbalanced-paren';

  return null;
}

/** 본문을 렌더했을 때 생기는 외부 링크 중 깨진 것을 모은다. */
export function auditLinks(markdown: string): LinkFinding[] {
  const findings: LinkFinding[] = [];
  for (const href of extractHrefs(markdown)) {
    const issue = auditUrl(href);
    if (issue) findings.push({ href, issue });
  }
  return findings;
}

export interface SumFinding {
  /** group: 한 문장 안의 열거 vs 합계. document: 문서 전체 합산 문장 vs 그룹 합계들. */
  kind: 'group' | 'document';
  /** 근거가 된 문장(문서 단위면 합산 문장). */
  sentence: string;
  /** 더해야 할 값들. */
  items: number[];
  /** 글이 적어 둔 값. */
  stated: number;
  /** 실제 합. */
  expected: number;
}

const toInt = (s: string) => Number(s.replace(/,/g, ''));
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

/** 마침표 뒤 공백 또는 줄바꿈으로 문장을 나눈다(`2026.08.14`처럼 공백 없는 마침표는 그대로 둔다). */
function sentences(markdown: string): string[] {
  return markdown
    .split(/(?<=\.)\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * "A 19세대, B 7세대, C 16세대로 총 42세대" 같은 열거-합계 문장을 검사한다.
 *
 * 휴리스틱이다. 쉼표로 열거된 `N세대`가 2개 이상이고 그 뒤에 `…로 (총) N세대` 마커가 있는
 * 문장만 본다. 조건이 좁아 놓치는 문장은 있어도, 잡은 건 확실히 산술이 어긋난 문장이다.
 */
export function auditUnitSums(markdown: string): SumFinding[] {
  const findings: SumFinding[] = [];
  const groupTotals: number[] = [];

  for (const sentence of sentences(markdown)) {
    const marks = [...sentence.matchAll(/(?:으)?로\s*(?:총\s*)?([\d,]+)\s*세대/g)];
    const last = marks.at(-1);
    if (!last || last.index === undefined) continue;

    const head = sentence.slice(0, last.index);
    if (!head.includes(',')) continue; // 열거가 아니면(단일 서술) 판단하지 않는다
    const items = [...head.matchAll(/([\d,]+)\s*세대/g)].map((m) => toInt(m[1]));
    if (items.length < 2) continue;

    const stated = toInt(last[1]);
    const expected = sum(items);
    groupTotals.push(expected);
    if (stated !== expected) findings.push({ kind: 'group', sentence, items, stated, expected });
  }

  // "총 세대 수를 합산하면 2,748세대" — 문서 전체 합산 문장은 그룹 합의 합과 같아야 한다.
  if (groupTotals.length >= 2) {
    for (const sentence of sentences(markdown)) {
      const m = sentence.match(/합(?:산|계)[^.]{0,20}?([\d,]+)\s*세대/);
      if (!m) continue;
      const stated = toInt(m[1]);
      const expected = sum(groupTotals);
      if (stated !== expected) {
        findings.push({ kind: 'document', sentence, items: groupTotals, stated, expected });
      }
    }
  }

  return findings;
}

/**
 * 표시 기관명과 출처 URL의 도메인이 명백히 어긋나면 경고한다.
 * (`임장ON 청약 집계`로 표시하면서 링크는 rt.molit.go.kr로 가던 사고 방지용.)
 * 매핑에 없는 기관명은 판단하지 않는다 — 모르는 건 경고하지 않는다.
 */
const AGENCY_HOSTS: Record<string, string[]> = {
  '임장ON 청약 집계': ['imjangon.co.kr'],
  정책브리핑: ['korea.kr'],
  국토교통부: ['molit.go.kr'],
  한국주택금융공사: ['hf.go.kr'],
  청약홈: ['applyhome.co.kr'],
  LH: ['lh.or.kr'],
  한국은행: ['bok.or.kr'],
  한국부동산원: ['reb.or.kr'],
  주택도시보증공사: ['khug.or.kr'],
  주택도시기금: ['molit.go.kr', 'myhome.go.kr'],
  국가법령정보센터: ['law.go.kr'],
  국가통계포털: ['kosis.kr'],
};

export interface AgencyFinding {
  agency: string;
  host: string;
  expectedHosts: string[];
}

export function auditSourceAgency(input: {
  sourceName: string;
  sourceUrl: string;
}): AgencyFinding | null {
  const agency = canonicalizeSourceName(input.sourceName);
  const expectedHosts = AGENCY_HOSTS[agency];
  if (!expectedHosts) return null;

  let host: string;
  try {
    host = new URL(input.sourceUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  const ok = expectedHosts.some((h) => host === h || host.endsWith(`.${h}`));
  return ok ? null : { agency, host, expectedHosts };
}
