import { test, expect } from '@playwright/test';
import { prisma } from '@/lib/db';

let noticeId: string;

test.beforeAll(async () => {
  const n = await prisma.subscriptionNotice.findFirst({ where: { sourceKey: 'E2E-SUB-1' } });
  if (!n) throw new Error('seed subscription "E2E-SUB-1" not found — pnpm seed:e2e 실행 확인');
  noticeId = String(n.id);
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test('subscription detail: 청약 결과 섹션(경쟁률·가점·특별공급)', async ({ page }) => {
  await page.goto(`/subscription/${noticeId}`);
  const sec = page.locator('#results');
  await expect(sec).toBeVisible();
  await expect(sec.getByRole('heading', { name: '청약 결과' })).toBeVisible();
  await expect(sec.getByText('1,692.33대 1')).toBeVisible();
  await expect(sec.getByRole('cell', { name: '84.97㎡ A' }).first()).toBeVisible();
  await expect(sec.getByRole('heading', { name: /당첨 가점/ })).toBeVisible();
  await expect(sec.getByRole('cell', { name: '생애최초' })).toBeVisible();
  await expect(sec.getByText(/최종 결과는 청약홈에서 확인하세요/)).toBeVisible();
});

test('subscription detail: FAQ에 청약 경쟁률 해석 문항', async ({ page }) => {
  await page.goto(`/subscription/${noticeId}`);
  const q = page.getByText('E2E 센트럴자이 청약 경쟁률은 어땠나요?');
  await expect(q).toBeVisible();
  await q.click();
  await expect(page.getByText(/가장 높은 주택형은 59\.98㎡로 1,692\.33대 1이었습니다/)).toBeVisible();
});
