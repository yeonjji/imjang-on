import { test, expect } from '@playwright/test';

// 헤더 통합검색에서 검색 시 /list?q=<검색어> 결과 목록으로 이동하는지 검증한다.
// (자동완성 드롭다운 자체는 dev 모드에서 비동기 렌더 타이밍에 민감하므로, 결정적인 Enter 제출 경로로 검증한다.)
// 모바일 서랍 검색은 emulated 키보드 네비게이션이 e2e 하니스에서 불안정하여 제외한다.
// (모바일 햄버거 서랍의 네비게이션은 mobile-nav.spec.ts가 커버)
test('nav search -> results list', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-mobile', '모바일 서랍 검색은 mobile-nav.spec.ts가 커버');
  // dev 모드 on-demand 컴파일(/, /list) 여유를 위해 타임아웃을 넉넉히.
  test.slow();
  await page.goto('/');

  const scope = page.locator('header');

  // dev 하이드레이션 직후 입력 핸들러가 아직 안 붙었을 수 있어 네비게이션이 성사될 때까지 재시도한다.
  await expect(async () => {
    const box = scope.getByPlaceholder('단지/지역명 검색');
    await box.fill('래미안');
    // controlled input이라 onKeyDown 클로저가 최신 q를 보도록 React 상태 커밋을 기다린다.
    await expect(box).toHaveValue('래미안');
    await box.press('Enter');
    await expect(page).toHaveURL(/\/list\?q=/, { timeout: 5000 });
  }).toPass({ timeout: 30_000 });
});
