import { describe, it, expect } from 'vitest';
import robots from '@/app/robots';

describe('robots.txt', () => {
  const result = robots();
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
  // allow 목록을 가진 그룹(*/Yeti)만 콘텐츠 크롤 허용 그룹. 전면 차단 그룹(allow 없음, disallow:'/')은
  // /api/staticmap·/api/·_rsc 예외가 적용되지 않으므로 아래 3개 단정에서 제외한다.
  const allowedRules = rules.filter((rule) => rule.allow !== undefined);
  const blockedRules = rules.filter((rule) => rule.allow === undefined);

  it('허용 그룹(*/Yeti)의 모든 룰에서 /api/staticmap 을 허용한다', () => {
    for (const rule of allowedRules) {
      const allow = Array.isArray(rule.allow) ? rule.allow : [rule.allow];
      expect(allow, `rule for ${String(rule.userAgent)}`).toContain('/api/staticmap');
    }
  });

  it('허용 그룹에서 /api/ 전반은 계속 차단한다', () => {
    for (const rule of allowedRules) {
      const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
      expect(disallow, `rule for ${String(rule.userAgent)}`).toContain('/api/');
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
});
