/**
 * EV 수집 결과 판정. 미완료(대개 429 일일 한도)면 실패 메시지를, 완료면 null.
 * 2026-08~10월 정기 수집이 첫 페이지 429로 끝났는데 'OK · 0건'으로 기록돼 3개월간 드러나지 않았다.
 */
export function evIngestFailure(r: { complete: boolean; lastPage: number; totalStations: number }): string | null {
  if (r.complete) return null;
  return `ev-charger 수집 미완료: ${r.lastPage}페이지까지 저장(충전소 ${r.totalStations}건) 후 중단 — 대개 일일 호출 한도(429). 다음 실행 때 체크포인트부터 재개.`;
}
