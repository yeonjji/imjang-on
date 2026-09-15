import { SITE_URL } from '@/lib/site';
import { isBoardPublic } from '@/lib/board/visibility';

/**
 * robots.txt 본문.
 *
 * Next의 MetadataRoute.Robots(app/robots.ts)가 아니라 직접 직렬화하는 이유는 하나 —
 * `Content-Signal` 지시어를 내보내야 하기 때문이다. 그 타입은 임의 지시어를 지원하지 않는다.
 *
 * 이 파일이 robots.txt의 단일 소스다. Cloudflare의 Managed robots.txt(AI Crawl Control →
 * Signals)를 켜두면 이 결과 앞에 자기 블록을 주입해 'User-agent: *' 그룹이 두 개가 되고,
 * 그룹 병합을 안 하는 파서는 첫 그룹만 읽어 아래 Disallow를 전부 놓친다. 그래서 껐다.
 */

/**
 * Content Signals Policy 선언 + 해설. Cloudflare Managed robots.txt가 주입하던 문구를
 * 그대로 옮긴 것으로, EU 저작권 지침 4조에 따른 권리유보 선언 역할을 한다.
 * 아래 봇 차단(Disallow: /)이 실효 방어라면 이쪽은 법적 선언이라 서로 대체되지 않는다.
 */
const CONTENT_SIGNAL_PREAMBLE = `# As a condition of accessing this website, you agree to abide by the following
# content signals:

# (a)  If a Content-Signal = yes, you may collect content for the corresponding
#      use.
# (b)  If a Content-Signal = no, you may not collect content for the
#      corresponding use.
# (c)  If the website operator does not include a Content-Signal for a
#      corresponding use, the website operator neither grants nor restricts
#      permission via Content-Signal with respect to the corresponding use.

# The content signals and their meanings are:

# search:   building a search index and providing search results (e.g., returning
#           hyperlinks and short excerpts from your website's contents). Search does not
#           include providing AI-generated search summaries.
# ai-input: inputting content into one or more AI models (e.g., retrieval
#           augmented generation, grounding, or other real-time taking of content for
#           generative AI search answers).
# ai-train: training or fine-tuning AI models.
# use:      how AI systems may consume the content (immediate, reference, or full).

# ANY RESTRICTIONS EXPRESSED VIA CONTENT SIGNALS ARE EXPRESS RESERVATIONS OF
# RIGHTS UNDER ARTICLE 4 OF THE EUROPEAN UNION DIRECTIVE 2019/790 ON COPYRIGHT
# AND RELATED RIGHTS IN THE DIGITAL SINGLE MARKET.`;

export const CONTENT_SIGNAL = 'search=yes,ai-train=no,use=reference';

/**
 * 콘텐츠 크롤을 허용하는 그룹('*'·Yeti)의 규칙.
 *
 * '/*_rsc='는 Next.js RSC 프리페치 복제 URL(text/x-component). 색인 대상이 아닌데 실제 페이지마다
 * 별도 크롤돼 크롤 예산·서버 부하(cold ISR → DB)를 낭비하므로 차단. '?_rsc='·'&_rsc=' 모두 매칭.
 *
 * '/list'는 disallow하지 않는다 — 페이지가 자체 noindex(meta)를 가지므로, disallow하면 크롤러가
 * 그 noindex를 읽지 못해 오히려 URL-only로 색인될 수 있고 홈 JSON-LD SearchAction(/list?q=) 타깃도
 * 막힌다. 필터는 client-side router.push라 facet 크롤 폭증도 없다(색인은 noindex가 막는다).
 */
function contentRules() {
  return {
    allow: ['/', '/apt/', '/officetel/', '/villa/', ...(isBoardPublic() ? ['/board/'] : [])],
    disallow: ['/api/', '/admin', '/*_rsc='],
  };
}

/**
 * 전면 차단 대상. 검색·광고 색인과 무관한 SEO 스크래퍼/AI 크롤러 — 서버 비용만 유발하고
 * 색인 이득이 없다.
 *
 * 뒤 5종은 Cloudflare Managed robots.txt가 차단하던 봇을 흡수한 것.
 * Google-Extended(Gemini 학습)·Applebot-Extended(Apple AI 학습)는 AI 학습 전용 토큰이라
 * 검색 색인·순위에 영향이 없다 — 검색용 Googlebot·Applebot은 별개이고 위 '*' 그룹으로 허용된다.
 * meta-externalagent도 마찬가지로, OG 미리보기용 facebookexternalhit은 차단하지 않는다.
 */
export const BLOCKED_BOTS = [
  'AhrefsBot',
  'SemrushBot',
  'MJ12bot',
  'DotBot',
  'GPTBot',
  'ClaudeBot',
  'CCBot',
  'Bytespider',
  'PetalBot',
  'Amazonbot',
  'Applebot-Extended',
  'meta-externalagent',
  'Google-Extended',
  'CloudflareBrowserRenderingCrawler',
];

function contentGroup(userAgent: string): string {
  const { allow, disallow } = contentRules();
  return [
    `User-agent: ${userAgent}`,
    `Content-Signal: ${CONTENT_SIGNAL}`,
    ...allow.map((path) => `Allow: ${path}`),
    ...disallow.map((path) => `Disallow: ${path}`),
  ].join('\n');
}

export function buildRobotsTxt(): string {
  const blockedGroup = [
    ...BLOCKED_BOTS.map((bot) => `User-agent: ${bot}`),
    'Disallow: /',
  ].join('\n');

  return [
    CONTENT_SIGNAL_PREAMBLE,
    contentGroup('*'),
    contentGroup('Yeti'),
    blockedGroup,
    `Sitemap: ${SITE_URL}/sitemap.xml`,
  ].join('\n\n') + '\n';
}
