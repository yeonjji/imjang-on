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
  protectedFiles: number;
  protectedBytes: number;
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
