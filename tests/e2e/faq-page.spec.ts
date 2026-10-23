import { test, expect } from '@playwright/test';

test('/faq: 데이터 근거형 문구와 기준일, 숫자 반영', async ({ page }) => {
  await page.goto('/faq');
  await expect(page.getByRole('heading', { name: '자주 묻는 질문', level: 1 })).toBeVisible();
  await expect(page.getByText(/답 속 숫자는 매일 새로 계산합니다 · \d{4}-\d{2}-\d{2} 기준/)).toBeVisible();
  const q = page.getByText('아파트 실거래가는 어디서 가져오나요?');
  await q.click();
  await expect(page.getByText(/매일 밤 자정과 새벽 4시에 받아 단지별로 묶습니다\. 지금 임장ON에 정리된 아파트는 [\d,]+개 단지입니다\./)).toBeVisible();
});

test('목록 페이지 FAQ도 같은 문구(전체 보기 링크 없음)', async ({ page }) => {
  await page.goto('/apt');
  await expect(page.getByText('아파트 실거래가는 어디서 가져오나요?')).toBeVisible();
  await expect(page.getByRole('link', { name: '자주 묻는 질문 전체 보기 →' })).toHaveCount(0);
});
