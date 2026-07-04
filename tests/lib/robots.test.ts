import { describe, it, expect } from 'vitest';
import robots from '@/app/robots';

describe('robots.txt', () => {
  const result = robots();
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules];

  it('모든 룰에서 /api/staticmap 을 허용한다', () => {
    for (const rule of rules) {
      const allow = Array.isArray(rule.allow) ? rule.allow : [rule.allow];
      expect(allow, `rule for ${String(rule.userAgent)}`).toContain('/api/staticmap');
    }
  });

  it('/api/ 전반은 계속 차단한다', () => {
    for (const rule of rules) {
      const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
      expect(disallow, `rule for ${String(rule.userAgent)}`).toContain('/api/');
    }
  });

  it('RSC 프리페치 URL(_rsc)을 모든 룰에서 차단한다', () => {
    for (const rule of rules) {
      const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
      expect(disallow, `rule for ${String(rule.userAgent)}`).toContain('/*_rsc=');
    }
  });
});
