import { test, expect } from '@playwright/test';

// Phase 1 nav: Soon 버튼은 데스크탑 메뉴(hidden md:flex)에만 존재.
// 모바일 nav는 Phase 2에서 bottom tab bar로 별도 구현 예정.
test.skip(({ viewport }) => (viewport?.width ?? 9999) < 768, 'mobile nav not implemented in Phase 1');

test('soon modal email signup', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /청약/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder('이메일 주소').fill('test@example.com');
  await dialog.getByRole('button', { name: '신청' }).click();
  await expect(dialog.getByText(/감사해요/)).toBeVisible();
});
