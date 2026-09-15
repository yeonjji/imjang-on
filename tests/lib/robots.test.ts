import { describe, it, expect } from 'vitest';
import robots from '@/app/robots';

describe('robots.txt', () => {
  const result = robots();
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
  // allow 목록을 가진 그룹(*/Yeti)만 콘텐츠 크롤 허용 그룹. 전면 차단 그룹(allow 없음, disallow:'/')은
  // /api/·_rsc 예외가 적용되지 않으므로 아래 단정에서 제외한다.
  const allowedRules = rules.filter((rule) => rule.allow !== undefined);
  const blockedRules = rules.filter((rule) => rule.allow === undefined);

  it('허용 그룹에서 /api/ 전반은 계속 차단한다', () => {
    for (const rule of allowedRules) {
      const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
      expect(disallow, `rule for ${String(rule.userAgent)}`).toContain('/api/');
    }
  });

  it('robots에 /api/staticmap 예외를 다시 두지 않는다 (라우트 삭제됨)', () => {
    for (const rule of allowedRules) {
      const allow = Array.isArray(rule.allow) ? rule.allow : [rule.allow];
      expect(allow, `rule for ${String(rule.userAgent)}`).not.toContain('/api/staticmap');
    }
  });

  it('RSC 프리페치 URL(_rsc)을 허용 그룹의 모든 룰에서 차단한다', () => {
    for (const rule of allowedRules) {
      const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
      expect(disallow, `rule for ${String(rule.userAgent)}`).toContain('/*_rsc=');
    }
  });

  it('/list는 disallow하지 않는다 (페이지 자체 noindex meta가 색인 제외를 담당 — disallow하면 그 noindex를 못 읽어 URL-only 색인 위험 + SearchAction /list?q= 타깃 차단)', () => {
    for (const rule of allowedRules) {
      const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
      expect(disallow, `rule for ${String(rule.userAgent)}`).not.toContain('/list');
    }
  });

  it('SEO 스크래퍼/AI 크롤러 그룹은 전면 차단한다', () => {
    expect(blockedRules.length).toBeGreaterThan(0);
    for (const rule of blockedRules) {
      const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
      expect(disallow, `rule for ${String(rule.userAgent)}`).toContain('/');
    }
  });

  it('Cloudflare Managed robots.txt가 차단하던 봇을 그대로 차단한다 (그 기능을 껐으므로)', () => {
    const blockedAgents = blockedRules.flatMap((rule) =>
      Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent]
    );
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

  it('검색용 크롤러는 전면 차단 목록에 넣지 않는다 (AI 학습 토큰만 차단)', () => {
    const blockedAgents = blockedRules.flatMap((rule) =>
      Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent]
    );
    // Googlebot·Applebot(검색)·Mediapartners-Google(AdSense)은 '*' 그룹으로 허용 유지돼야 한다.
    // Google-Extended·Applebot-Extended는 AI 학습 전용 토큰이라 차단해도 색인에 영향이 없다.
    for (const agent of ['Googlebot', 'Applebot', 'Mediapartners-Google', 'Bingbot']) {
      expect(blockedAgents).not.toContain(agent);
    }
  });
});
