import { test, expect } from '@playwright/test';
import { prisma } from '@/lib/db';

let propertyId: string;

test.beforeAll(async () => {
  const apt = await prisma.property.findFirst({
    where: { name: { contains: '래미안서초' } },
    select: { id: true },
  });
  if (!apt) throw new Error('seed apartment "래미안서초…" not found — globalSetup 실행 확인');
  propertyId = String(apt.id);
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test('apt detail: 주변 생활 인프라 블록이 렌더된다', async ({ page }) => {
  await page.goto(`/apt/${propertyId}`);

  const poi = page.locator('#poi');
  await expect(poi).toBeVisible();
  await expect(poi.getByRole('heading', { name: '주변 생활 인프라' })).toBeVisible();
  // 시드 주차장 2곳이 반경 500m 내 → '주차장' 카테고리가 노출되어야 함
  await expect(poi.getByText('주차장').first()).toBeVisible();
});

test('apt detail: unified transaction table + page 2', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`/apt/${propertyId}`);
  await expect(page.getByRole('heading', { name: /래미안/ })).toBeVisible();

  await expect(page.getByText('최근 실거래 내역')).toBeVisible();

  for (const badge of ['매매', '전세', '월세']) {
    await expect(page.getByText(badge).first()).toBeVisible();
  }

  await page.getByRole('button', { name: '2' }).click();
  await expect(page.getByText(/36건 중 16–30/)).toBeVisible();
});

test('apt detail: 가격 흐름 그래프 — 헤더 숫자 + 유형 탭 전환', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/apt/${propertyId}`);

  const chart = page.locator('#chart');
  await expect(chart.getByRole('heading', { name: '가격 흐름 그래프' })).toBeVisible();

  // 헤더 풀세트 숫자
  await expect(chart.getByText('현재 시세')).toBeVisible();
  await expect(chart.getByText('최고가')).toBeVisible();
  await expect(chart.getByText('최저가')).toBeVisible();
  await expect(chart.getByText('거래건수')).toBeVisible();

  // recharts SVG 렌더 확인
  await expect(chart.locator('svg.recharts-surface').first()).toBeVisible();

  // 전세 탭 전환 → 클릭 후에도 헤더 영역 유지
  await chart.getByRole('button', { name: '전세', exact: true }).click();
  await expect(chart.getByText('현재 시세')).toBeVisible();
});

test('apt detail: 가격 그래프 모바일 폭 — 가로 오버플로우 없음', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/apt/${propertyId}`);

  const chart = page.locator('#chart');
  await expect(chart.locator('svg.recharts-surface').first()).toBeVisible();

  // 문서 가로 스크롤(가로 오버플로우) 없어야 함
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
