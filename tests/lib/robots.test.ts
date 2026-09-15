import { describe, it, expect } from 'vitest';
import { buildRobotsTxt, BLOCKED_BOTS, CONTENT_SIGNAL } from '@/lib/seo/robots';

type Group = { userAgents: string[]; allow: string[]; disallow: string[] };

/**
 * 생성된 robots.txt 원문을 그룹으로 파싱한다. 구조체가 아니라 실제 출력 문자열을 검증해야
 * 직렬화 단계의 실수까지 잡힌다(과거에 차단 봇 일부가 조용히 누락된 적 있음).
 */
function parseGroups(text: string): Group[] {
  return text
    .split('\n\n')
    .filter((block) => block.includes('User-agent:'))
    .map((block) => {
      const lines = block.split('\n');
      const pick = (prefix: string) =>
        lines.filter((l) => l.startsWith(prefix)).map((l) => l.slice(prefix.length).trim());
      return {
        userAgents: pick('User-agent:'),
        allow: pick('Allow:'),
        disallow: pick('Disallow:'),
      };
    });
}

describe('robots.txt', () => {
  const text = buildRobotsTxt();
  const groups = parseGroups(text);
  // allow 목록을 가진 그룹(*/Yeti)만 콘텐츠 크롤 허용 그룹. 전면 차단 그룹(allow 없음, disallow:'/')은
  // /api/·_rsc 예외가 적용되지 않으므로 아래 단정에서 제외한다.
  const allowedGroups = groups.filter((g) => g.allow.length > 0);
  const blockedGroups = groups.filter((g) => g.allow.length === 0);

  it("'User-agent: *' 그룹은 정확히 하나다 (Cloudflare Managed robots.txt 중복 주입 회귀 방지)", () => {
    const starGroups = groups.filter((g) => g.userAgents.includes('*'));
    expect(starGroups).toHaveLength(1);
  });

  it('허용 그룹에서 /api/ 전반은 계속 차단한다', () => {
    expect(allowedGroups.length).toBeGreaterThan(0);
    for (const group of allowedGroups) {
      expect(group.disallow, `group ${group.userAgents.join(',')}`).toContain('/api/');
    }
  });

  it('robots에 /api/staticmap 예외를 다시 두지 않는다 (라우트 삭제됨)', () => {
    for (const group of allowedGroups) {
      expect(group.allow, `group ${group.userAgents.join(',')}`).not.toContain('/api/staticmap');
    }
  });

  it('RSC 프리페치 URL(_rsc)을 허용 그룹의 모든 룰에서 차단한다', () => {
    for (const group of allowedGroups) {
      expect(group.disallow, `group ${group.userAgents.join(',')}`).toContain('/*_rsc=');
    }
  });

  it('/list는 disallow하지 않는다 (페이지 자체 noindex meta가 색인 제외를 담당 — disallow하면 그 noindex를 못 읽어 URL-only 색인 위험 + SearchAction /list?q= 타깃 차단)', () => {
    for (const group of allowedGroups) {
      expect(group.disallow, `group ${group.userAgents.join(',')}`).not.toContain('/list');
    }
  });

  it('SEO 스크래퍼/AI 크롤러 그룹은 전면 차단한다', () => {
    expect(blockedGroups.length).toBeGreaterThan(0);
    for (const group of blockedGroups) {
      expect(group.disallow, `group ${group.userAgents.join(',')}`).toContain('/');
    }
  });

  it('Cloudflare Managed robots.txt가 차단하던 봇을 그대로 차단한다 (그 기능을 껐으므로)', () => {
    const blockedAgents = blockedGroups.flatMap((g) => g.userAgents);
    for (const agent of [
      'Amazonbot',
      'Applebot-Extended',
      'meta-externalagent',
      'Google-Extended',
      'CloudflareBrowserRenderingCrawler',
    ]) {
      expect(blockedAgents).toContain(agent);
    }
  });

  it('BLOCKED_BOTS가 빠짐없이 출력된다', () => {
    const blockedAgents = blockedGroups.flatMap((g) => g.userAgents);
    expect(blockedAgents.sort()).toEqual([...BLOCKED_BOTS].sort());
  });

  it('검색용 크롤러는 전면 차단 목록에 넣지 않는다 (AI 학습 토큰만 차단)', () => {
    const blockedAgents = blockedGroups.flatMap((g) => g.userAgents);
    // Googlebot·Applebot(검색)·Mediapartners-Google(AdSense)은 '*' 그룹으로 허용 유지돼야 한다.
    // Google-Extended·Applebot-Extended는 AI 학습 전용 토큰이라 차단해도 색인에 영향이 없다.
    for (const agent of ['Googlebot', 'Applebot', 'Mediapartners-Google', 'Bingbot']) {
      expect(blockedAgents).not.toContain(agent);
    }
  });

  it('Content-Signal을 허용 그룹마다 선언한다 (EU 저작권 지침 4조 권리유보)', () => {
    for (const group of allowedGroups) {
      expect(text).toContain(`User-agent: ${group.userAgents[0]}\nContent-Signal: ${CONTENT_SIGNAL}`);
    }
    expect(text).toContain('ARTICLE 4 OF THE EUROPEAN UNION DIRECTIVE 2019/790');
  });

  it('sitemap을 선언한다', () => {
    expect(text).toMatch(/^Sitemap: https?:\/\/\S+\/sitemap\.xml$/m);
  });
});
