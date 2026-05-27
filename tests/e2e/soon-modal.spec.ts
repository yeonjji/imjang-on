import { test, expect } from '@playwright/test';

// 이 테스트는 데스크톱 인라인 메뉴의 청약 버튼을 직접 클릭한다.
// 모바일에서는 청약 버튼이 햄버거 서랍 안에 있고(닫혀 있으면 inert) 직접 클릭 대상이 아니므로 데스크톱에서만 실행한다.
// (모바일 서랍 동작은 mobile-nav.spec.ts에서 커버)
test.skip(({ viewport }) => (viewport?.width ?? 9999) < 768, '청약 버튼은 모바일에선 햄버거 서랍 안에 있어 데스크톱에서만 테스트');

test('soon modal email signup', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /청약/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder('이메일 주소').fill('test@example.com');
  await dialog.getByRole('button', { name: '신청' }).click();
  await expect(dialog.getByText(/감사해요/)).toBeVisible();
});
