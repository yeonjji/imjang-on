import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { htmlToText } from '@/lib/board/html-text';
import { isAllowedDomain, detectKoglType, isUsableLicense, domainLabel, licenseLabel, type KoglType } from '@/lib/board/source-policy';
import { collectKoreaNews } from '@/lib/board/sources/korea-news';

const WEBKR_URL = 'https://openapi.naver.com/v1/search/webkr.json';
const SEARCH_TIMEOUT_MS = 8_000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_CANDIDATES = 5; // 추출 시도 상한(레이턴시·타임박스)
/** 추출 본문(공백제외) 최소 길이. 이보다 짧으면 1,000자 기사로 못 키워 배제. spike로 튜닝. */
export const MIN_SOURCE_CHARS = 800;
/** generateDraft에 넘기는 sourceText 상한(레이턴시·토큰 통제). 기사 1편엔 충분. */
export const MAX_SOURCE_TEXT_CHARS = 16_000;

export interface ResearchDeps {
  fetchImpl?: typeof fetch;
  clientId?: string;
  clientSecret?: string;
  serviceKey?: string;
}

export interface SourceMeta {
  url: string;
  domain: string;
  koglType: KoglType;
  usable: boolean;
  title: string;
  chars: number;
}
export interface GroundedResult {
  sourceName: string;
  sourceUrl: string;
  sourceDate: Date;
  sourceText: string;
  sourceExcerpt: string;
  used: SourceMeta[];
  /** 대표 근거의 발행일을 신뢰할 수 있는지. korea.kr(30일 제한 코퍼스)=true, 네이버 웹문서(발행일 미제공)=false. */
  repDateKnown: boolean;
}
export interface ResearchResult {
  candidates: SourceMeta[];
  grounded: GroundedResult | null;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}
function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
}

interface RawCandidate {
  title: string;
  url: string;
}

/** 네이버 웹문서 검색으로 후보 URL 수집. 자격증명/오류 시 빈 배열(graceful). 스니펫은 버린다. */
async function searchTopic(topic: string, deps: ResearchDeps): Promise<RawCandidate[]> {
  const clientId = deps.clientId ?? env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = deps.clientSecret ?? env.NAVER_SEARCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];
  const doFetch = deps.fetchImpl ?? fetch;

  const url = new URL(WEBKR_URL);
  url.searchParams.set('query', topic);
  url.searchParams.set('display', '20');

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await doFetch(url.toString(), {
      signal: ctrl.signal,
      headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { items?: { title: string; link: string }[] };
    return (json.items ?? []).map((it) => ({ title: stripHtml(it.title), url: it.link }));
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

/** 공식 출처 편향 변형 쿼리로 recall 향상. 결과는 합집합(중복은 researchTopic에서 제거). */
const QUERY_SUFFIXES = ['', ' 보도자료', ' 제도', ' 지원'];
async function searchVariants(topic: string, deps: ResearchDeps): Promise<RawCandidate[]> {
  const results = await Promise.all(QUERY_SUFFIXES.map((suffix) => searchTopic(`${topic}${suffix}`.trim(), deps)));
  return results.flat();
}

/** 공식 페이지 fetch + 본문 추출 + 공공누리 판정. 실패 시 null(graceful). */
async function fetchAndExtract(url: string, deps: ResearchDeps): Promise<{ text: string; koglType: KoglType } | null> {
  const doFetch = deps.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await doFetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'imjang-on/1.0 (+https://imjang-on.com)' },
    });
    if (!res.ok) return null;
    // 리다이렉트로 허용외 호스트에 도달했으면 배제(공공저작물 보증·SSRF 방지). 테스트 fake엔 res.url이 없어 스킵.
    if (res.url && !isAllowedDomain(res.url)) return null;
    const html = await res.text();
    // 공공누리 마커는 원본 HTML에서 판정하고, 본문은 script/style 제거 후 추출(JS·CSS 노이즈 차단).
    const koglType = detectKoglType(html);
    const cleaned = html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
    return { text: htmlToText(cleaned), koglType };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** korea.kr 정책뉴스 도메인 여부. 대표 우선순위 + 발행일 신뢰(30일 제한 코퍼스) 판정에 공용. */
function isKoreaKrDomain(domain: string): boolean {
  return domain === 'korea.kr' || domain === 'www.korea.kr';
}

/** 대표 출처 우선순위: korea.kr > 기타, 그다음 본문 길이 내림차순. */
function rankUsable(a: SourceMeta, b: SourceMeta): number {
  const score = (m: SourceMeta) => (isKoreaKrDomain(m.domain) ? 0 : 1);
  return score(a) - score(b) || b.chars - a.chars;
}

/** 주제 → 공공누리 이용가능 공식 근거 수집 + 대표출처 collapse. */
export async function researchTopic(topic: string, today: Date, deps: ResearchDeps = {}): Promise<ResearchResult> {
  // (1) korea.kr 정책뉴스 코퍼스: 본문 포함 → fetch/추출 불필요. API가 준 KoglType으로 라이선스 판정.
  const koreaArticles = await collectKoreaNews(topic, today, { fetchImpl: deps.fetchImpl, serviceKey: deps.serviceKey });

  // (2) 네이버 멀티쿼리 → 허용 도메인만 + 동일 URL 중복 제거 → 상한.
  const raw = await searchVariants(topic, deps);
  const allowed = [...new Map(raw.filter((c) => isAllowedDomain(c.url)).map((c) => [c.url, c])).values()].slice(
    0,
    MAX_CANDIDATES,
  );
  const exts = await Promise.all(allowed.map((c) => fetchAndExtract(c.url, deps)));

  const metas: SourceMeta[] = [];
  const bodies = new Map<string, string>();

  // 정책뉴스 먼저 등록(대표 우선순위·중복 기준). 제한유형(2·3·4)은 네이버와 동일 게이트로 배제.
  for (const a of koreaArticles) {
    if (bodies.has(a.url)) continue;
    const chars = a.body.replace(/\s/g, '').length;
    const usable = isUsableLicense(a.koglType) && chars >= MIN_SOURCE_CHARS;
    metas.push({ url: a.url, domain: hostOf(a.url), koglType: a.koglType, usable, title: a.title, chars });
    bodies.set(a.url, a.body);
  }

  // 네이버 후보 등록(정책뉴스와 동일 URL이면 스킵).
  allowed.forEach((c, i) => {
    if (bodies.has(c.url)) return;
    const ext = exts[i];
    const koglType: KoglType = ext?.koglType ?? 'unknown';
    const chars = ext ? ext.text.replace(/\s/g, '').length : 0;
    const usable = !!ext && isUsableLicense(koglType) && chars >= MIN_SOURCE_CHARS;
    metas.push({ url: c.url, domain: hostOf(c.url), koglType, usable, title: c.title, chars });
    if (ext) bodies.set(c.url, ext.text);
  });

  const usable = metas.filter((m) => m.usable).sort(rankUsable);
  if (usable.length === 0) {
    logger.info({ topic, candidates: metas.length }, 'research: no usable public-domain source');
    return { candidates: metas, grounded: null };
  }

  const rep = usable[0];
  const header = (m: SourceMeta) => `[출처: ${domainLabel(m.domain)} · ${licenseLabel(m.koglType)} · ${m.url}]`;
  const sourceText = usable
    .map((m) => `${header(m)}\n${bodies.get(m.url) ?? ''}`)
    .join('\n\n')
    .slice(0, MAX_SOURCE_TEXT_CHARS);
  const sourceExcerpt = `${header(rep)}\n${bodies.get(rep.url) ?? ''}`.slice(0, 4000);

  return {
    candidates: metas,
    grounded: {
      sourceName: domainLabel(rep.domain),
      sourceUrl: rep.url,
      sourceDate: today,
      sourceText,
      sourceExcerpt,
      used: usable,
      repDateKnown: isKoreaKrDomain(rep.domain),
    },
  };
}
