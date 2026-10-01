// 나이스 학교 필드를 화면 문구로 바꾸는 순수 함수.

/** 계열·입학 전형은 고등학교에서만 의미가 있다(초·중·특수학교는 '일반계'·'전기'가 기본값으로 채워져 온다). */
export function isHighSchool(kind: string | null | undefined): boolean {
  return kind === '고등학교';
}

export function schoolOpenYears(anniversaryAt: Date | null | undefined, nowYear: number): number | null {
  if (!anniversaryAt) return null;
  const y = anniversaryAt.getUTCFullYear();
  return y > nowYear ? null : nowYear - y;
}

export function formatYmd(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function formatMonthDay(d: Date | null | undefined): string | null {
  return d ? `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일` : null;
}
