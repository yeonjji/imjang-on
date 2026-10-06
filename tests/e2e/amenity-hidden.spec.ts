import { test, expect } from '@playwright/test';
import { isAmenityPublic } from '@/lib/amenity/visibility';

// 상권·편의 비공개 동안 /amenity 하위는 전부 사이트 404 페이지를 404로 낸다(middleware rewrite).
test.describe('상권·편의 비공개', () => {
  test.skip(isAmenityPublic(), '상권·편의 공개 중');

  for (const path of ['/amenity', '/amenity/convenience', '/amenity/market', '/amenity/mart/1', '/life/amenity']) {
    test(`${path} → 404`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(404);
    });
  }

  test('홈 생활편의 메뉴·푸터에 /amenity 링크가 없다', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('a[href^="/amenity"]')).toHaveCount(0);
  });
});
