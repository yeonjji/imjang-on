import { test, expect } from '@playwright/test';

// /finance는 seed된 대출상품 25건(seq 900001~)으로 2페이지가 된다.
// 데스크톱·모바일 두 프로젝트 모두에서: 1페이지 20개 → 다음 페이지 5개 + ?page=2,
// 정렬(필터) 변경 시 page 파라미터 제거 + 1페이지 복귀를 검증한다.
// (데스크톱/모바일 페이저는 각기 다른 '다음 페이지' 버튼을 렌더하지만, 숨겨진 쪽은
//  접근성 트리에서 빠지므로 role 매칭이 뷰포트별로 보이는 버튼 하나만 잡는다.)
test('finance 목록 페이지네이션: 페이지 이동·URL·필터 리셋', async ({ page }) => {
  test.slow(); // dev on-demand 컴파일 여유

  await page.goto('/finance');
  await expect(page.getByRole('heading', { name: '서민금융 대출상품' })).toBeVisible({ timeout: 10_000 });

  // seed 카드만 카운트 (href=/finance/9000xx)
  const cards = page.locator('a[href^="/finance/9000"]');
  await expect(cards).toHaveCount(20);

  const pager = page.getByRole('navigation', { name: '페이지네이션' });
  await expect(pager).toBeVisible();

  // dev 하이드레이션 지연에 대비해 클릭+URL 검증을 재시도.
  await expect(async () => {
    await pager.getByRole('button', { name: '다음 페이지' }).click();
    await expect(page).toHaveURL(/[?&]page=2/, { timeout: 3000 });
  }).toPass({ timeout: 20_000 });

  await expect(cards).toHaveCount(5); // 25 - 20

  // 정렬(필터) 변경 → page 파라미터 제거 + 1페이지 복귀
  await page.getByLabel('정렬').selectOption('limitDesc');
  await expect(page).not.toHaveURL(/[?&]page=/);
  await expect(cards).toHaveCount(20);
});
