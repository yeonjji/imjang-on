import { test, expect } from '@playwright/test';
import { prisma } from '@/lib/db';

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function idByName(contains: string): Promise<string> {
  const p = await prisma.property.findFirst({
    where: { name: { contains } },
    select: { id: true },
  });
  if (!p) throw new Error(`seed property "${contains}" not found — seed-e2e 실행 확인`);
  return String(p.id);
}

test('officetel detail: 주변 생활 인프라 블록이 렌더된다', async ({ page }) => {
  const id = await idByName('센트럴오피스텔');
  await page.goto(`/officetel/${id}`);

  const poi = page.locator('#poi');
  await expect(poi).toBeVisible();
  await expect(poi.getByRole('heading', { name: '주변 생활 인프라' })).toBeVisible();
  // 시드 주차장 2곳이 반경 500m 내 → '주차장' 카테고리가 노출되어야 함
  await expect(poi.getByText('주차장').first()).toBeVisible();
});

test('villa detail: 주변 생활 인프라 블록이 렌더된다', async ({ page }) => {
  const id = await idByName('서초빌라');
  await page.goto(`/villa/${id}`);

  const poi = page.locator('#poi');
  await expect(poi).toBeVisible();
  await expect(poi.getByRole('heading', { name: '주변 생활 인프라' })).toBeVisible();
  await expect(poi.getByText('주차장').first()).toBeVisible();
});

test('villa detail: 건축물 정보와 근린생활시설 안내', async ({ page }) => {
  const id = await idByName('서초빌라');
  await page.goto(`/villa/${id}`);
  const sec = page.locator('#building-register');
  await expect(sec).toBeVisible();
  await expect(sec.getByText('세대당 0.86대')).toBeVisible();
  await expect(sec.getByText(/근린생활시설 용도가 포함되어 있습니다/)).toBeVisible();
});
