// 나이스 학교 필드를 화면 문구로 바꾸는 순수 함수.

/** 계열·입학 전형은 고등학교에서만 의미가 있다(초·중·특수학교는 '일반계'·'전기'가 기본값으로 채워져 온다). */
export function isHighSchool(kind: string | null | undefined): boolean {
  return kind === '고등학교';
}

/** 개교기념일이 설립일보다 이만큼 넘게 늦으면 개교 연도로 믿지 않는다(부설 학교의 재지정일 등). */
const MAX_FOUNDED_TO_OPEN_YEARS = 5;

export function schoolOpenYears(
  anniversaryAt: Date | null | undefined,
  nowYear: number,
  foundedAt?: Date | null,
): number | null {
  if (!anniversaryAt) return null;
  const y = anniversaryAt.getUTCFullYear();
  if (foundedAt && y - foundedAt.getUTCFullYear() > MAX_FOUNDED_TO_OPEN_YEARS) return null;
  return y > nowYear ? null : nowYear - y;
}

export function formatYmd(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function formatMonthDay(d: Date | null | undefined): string | null {
  return d ? `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일` : null;
}

/** '1989년 4월 28일' — 히어로의 "개교 N년"을 독자가 확인할 수 있게 연도까지 보인다. */
export function formatYmdKo(d: Date | null | undefined): string | null {
  return d ? `${d.getUTCFullYear()}년 ${formatMonthDay(d)}` : null;
}
