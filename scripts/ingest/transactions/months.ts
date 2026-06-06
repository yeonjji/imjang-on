// 'YYYYMM' 구간 [from, to]를 최신(to) → 과거(from) 내림차순 목록으로 반환.
// 백필을 기존 데이터에 인접한 월부터 채워, 차트가 과거로 점진 확장되도록 한다.
export function getRangeMonths(from: string, to: string): string[] {
  const fromY = Number(from.slice(0, 4));
  const fromM = Number(from.slice(4, 6));
  let y = Number(to.slice(0, 4));
  let m = Number(to.slice(4, 6));
  const out: string[] = [];
  while (y > fromY || (y === fromY && m >= fromM)) {
    out.push(`${y}${String(m).padStart(2, '0')}`);
    m--;
    if (m === 0) {
      m = 12;
      y--;
    }
  }
  return out;
}
