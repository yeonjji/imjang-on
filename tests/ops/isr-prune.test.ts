import { describe, it, expect } from 'vitest';
import { planEviction, prune } from '@/scripts/ops/isr-prune/prune.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('planEviction', () => {
  it('상한 아래면 아무것도 지우지 않는다', () => {
    const r = planEviction({
      pages: [{ key: 'a', bytes: 100, atimeMs: 1 }],
      protectedBytes: 50,
      maxBytes: 1000,
    });
    expect(r.deleteKeys).toEqual([]);
    expect(r.freedBytes).toBe(0);
    expect(r.remainingBytes).toBe(150);
  });

  it('atime이 오래된 페이지부터 지워 상한 아래로 내린다', () => {
    const r = planEviction({
      pages: [
        { key: 'new', bytes: 100, atimeMs: 300 },
        { key: 'old', bytes: 100, atimeMs: 100 },
        { key: 'mid', bytes: 100, atimeMs: 200 },
      ],
      protectedBytes: 0,
      maxBytes: 150,
    });
    expect(r.deleteKeys).toEqual(['old', 'mid']);
    expect(r.freedBytes).toBe(200);
    expect(r.remainingBytes).toBe(100);
  });

  it('상한 아래로 내려가면 즉시 멈춘다', () => {
    const r = planEviction({
      pages: [
        { key: 'a', bytes: 100, atimeMs: 1 },
        { key: 'b', bytes: 100, atimeMs: 2 },
        { key: 'c', bytes: 100, atimeMs: 3 },
      ],
      protectedBytes: 0,
      maxBytes: 250,
    });
    expect(r.deleteKeys).toEqual(['a']);
  });

  // 보호 대상만으로 상한을 넘으면 지울 수 있는 건 다 지우되 그 이상은 못 한다.
  it('보호 용량이 상한을 넘으면 후보를 전부 지우고 멈춘다', () => {
    const r = planEviction({
      pages: [{ key: 'a', bytes: 100, atimeMs: 1 }],
      protectedBytes: 500,
      maxBytes: 200,
    });
    expect(r.deleteKeys).toEqual(['a']);
    expect(r.remainingBytes).toBe(500);
  });

  // atime 동률에서 순서가 흔들리면 재실행마다 결과가 달라져 검증이 불가능해진다.
  it('atime이 같으면 key 사전순으로 결정적이다', () => {
    const r = planEviction({
      pages: [
        { key: 'b', bytes: 100, atimeMs: 5 },
        { key: 'a', bytes: 100, atimeMs: 5 },
      ],
      protectedBytes: 0,
      maxBytes: 100,
    });
    expect(r.deleteKeys).toEqual(['a']);
  });
});

/** 페이지 한 벌(.html·.rsc·.meta)을 만들고 mtime·atime을 지정한다. */
function makePage(dir: string, name: string, bytes: number, epochSec: number) {
  for (const ext of ['html', 'rsc', 'meta']) {
    const p = join(dir, `${name}.${ext}`);
    writeFileSync(p, 'x'.repeat(Math.max(1, Math.floor(bytes / 3))));
    utimesSync(p, epochSec, epochSec); // atime, mtime
  }
}

describe('prune', () => {
  it('기준선 이전 파일은 지우지 않는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'isr-'));
    makePage(dir, 'build-artifact', 300, 1000); // 기준선 이전
    makePage(dir, 'runtime-page', 300, 3000); // 기준선 이후

    const r = await prune({ dir, baselineMs: 2000 * 1000, maxBytes: 1, dryRun: false });

    expect(existsSync(join(dir, 'build-artifact.html'))).toBe(true);
    expect(existsSync(join(dir, 'runtime-page.html'))).toBe(false);
    expect(r.protectedFiles).toBe(3);
    expect(r.deletedPages).toBe(1);
  });

  it('페이지 3종을 함께 지운다 — 부분 삭제가 남으면 안 된다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'isr-'));
    makePage(dir, 'p', 300, 3000);

    await prune({ dir, baselineMs: 2000 * 1000, maxBytes: 1, dryRun: false });

    expect(readdirSync(dir)).toEqual([]);
  });

  it('.html/.rsc/.meta 외 확장자는 건드리지 않는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'isr-'));
    makePage(dir, 'p', 300, 3000);
    const other = join(dir, 'route.js');
    writeFileSync(other, 'x');
    utimesSync(other, 3000, 3000); // 기준선 이후지만 대상 확장자가 아니다

    await prune({ dir, baselineMs: 2000 * 1000, maxBytes: 1, dryRun: false });

    expect(existsSync(other)).toBe(true);
  });

  it('하위 디렉터리를 재귀 탐색한다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'isr-'));
    const sub = join(dir, 'amenity', 'cafe');
    mkdirSync(sub, { recursive: true });
    makePage(sub, '172547', 300, 3000);

    const r = await prune({ dir, baselineMs: 2000 * 1000, maxBytes: 1, dryRun: false });

    expect(r.deletedPages).toBe(1);
    expect(existsSync(join(sub, '172547.html'))).toBe(false);
  });

  it('dryRun이면 계산만 하고 지우지 않는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'isr-'));
    makePage(dir, 'p', 300, 3000);

    const r = await prune({ dir, baselineMs: 2000 * 1000, maxBytes: 1, dryRun: true });

    expect(r.deletedPages).toBe(1);
    expect(r.dryRun).toBe(true);
    expect(existsSync(join(dir, 'p.html'))).toBe(true);
  });

  it('상한 아래면 아무것도 지우지 않는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'isr-'));
    makePage(dir, 'p', 300, 3000);

    const r = await prune({ dir, baselineMs: 2000 * 1000, maxBytes: 10_000_000, dryRun: false });

    expect(r.deletedPages).toBe(0);
    expect(existsSync(join(dir, 'p.html'))).toBe(true);
  });
});
