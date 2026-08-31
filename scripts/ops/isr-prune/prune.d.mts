export interface PageEntry {
  /** 확장자를 뺀 경로. `.html`·`.rsc`·`.meta`가 이 key를 공유한다. */
  key: string;
  /** 3종 파일 크기 합계(바이트). */
  bytes: number;
  /** 3종 중 가장 이른 atime(ms). */
  atimeMs: number;
}

export interface EvictionPlan {
  deleteKeys: string[];
  freedBytes: number;
  remainingBytes: number;
}

export function planEviction(input: {
  pages: PageEntry[];
  protectedBytes: number;
  maxBytes: number;
}): EvictionPlan;

export interface PruneResult {
  totalBytes: number;
  maxBytes: number;
  /** 기준선(baselineMs = 이미지 생성 시각) 이전 mtime — 빌드 시 이미지에 구워진 산출물. */
  baselineProtectedFiles: number;
  baselineProtectedBytes: number;
  /** 대상 확장자(PAGE_EXTS)가 아닌 파일 — mtime과 무관하게 총량에만 반영한다. */
  nonPageFiles: number;
  nonPageBytes: number;
  candidatePages: number;
  deletedPages: number;
  freedBytes: number;
  remainingBytes: number;
  durationMs: number;
  dryRun: boolean;
}

export function prune(input: {
  dir: string;
  baselineMs: number;
  maxBytes: number;
  dryRun?: boolean;
}): Promise<PruneResult>;
