import { test, expect } from '@playwright/test';
import { prisma } from '@/lib/db';

let propertyId: string;

test.beforeAll(async () => {
  const apt = await prisma.property.findFirst({
    where: { name: { contains: '래미안서초' } },
    select: { id: true },
  });
  if (!apt) throw new Error('seed apartment not found — run pnpm seed:e2e');
  propertyId = String(apt.id);
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test('apt detail: 근처 지하철역 섹션이 렌더된다', async ({ page }) => {
  await page.goto(`/apt/${propertyId}`);
  const subway = page.locator('#subway');
  await expect(subway).toBeVisible();
  await expect(subway.getByRole('heading', { name: '🚇 근처 지하철역' })).toBeVisible();
});

test('list 역세권 필터: 역 선택 시 station 파라미터 + 결과 반영', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/list');
  const panel = page.locator('aside');
  await panel.getByPlaceholder('역 이름 검색 (예: 강남)').fill('E2E중앙역');
  await panel.getByRole('button', { name: /E2E중앙역/ }).click();
  await expect(page).toHaveURL(/station=/, { timeout: 10000 });
  await expect(page.getByText('래미안서초에스티지').first()).toBeVisible({ timeout: 15000 });
});
