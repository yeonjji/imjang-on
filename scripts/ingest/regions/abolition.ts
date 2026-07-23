/**
 * 재시드 시 폐지 검출.
 * 원본(data.go.kr 법정동코드)은 폐지 코드를 반환하지 않으므로, 이번 시드에서
 * sourceVersion이 갱신되지 않은(= API에 없는) 활성 코드를 폐지된 행정구역으로 본다.
 * seed-from-api.ts의 updateMany WHERE(`sourceVersion != 현재 && isAbolished=false`)와 동일 규칙.
 */
export function shouldAbolish(
  row: { sourceVersion: string; isAbolished: boolean },
  currentVersion: string,
): boolean {
  return !row.isAbolished && row.sourceVersion !== currentVersion;
}

/** 폐지일: override(REGION_ABOLISHED_AT) 우선, 없으면 sourceVersion 월의 1일. */
export function abolishedDate(sourceVersion: string, override?: string | null): Date {
  const s = override && override.trim() ? override.trim() : `${sourceVersion}-01`;
  return new Date(s);
}
