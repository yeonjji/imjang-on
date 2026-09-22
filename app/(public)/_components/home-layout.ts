/**
 * 히어로와 동네 거래 카드를 담는 행의 클래스.
 *
 * 두 칸 전환이 xl(1280px)부터인 이유는 실측이다. 컨테이너 내부 1132px에서 gap 40을
 * 빼고 69:31로 나누면 카드는 바깥 339px·콘텐츠 297px인데, 필터 첫 줄(시도 155 +
 * 시군구 95 + 간격 8 = 258px)이 여기 들어간다. lg(1024px)에서는 카드 콘텐츠가
 * 248px로 줄어 그 줄이 깨지고 거래 행이 카드 밖으로 넘친다.
 *
 * hasPanel이 false면 빈 문자열이다. 명시적 31fr 트랙은 콘텐츠가 없어도 자기 몫을
 * 차지해 오른쪽에 빈 칸을 남긴다.
 */
export function heroRowClass(hasPanel: boolean): string {
  return hasPanel ? 'xl:grid xl:grid-cols-[69fr_31fr] xl:gap-10 xl:items-start' : '';
}
