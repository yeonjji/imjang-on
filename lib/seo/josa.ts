type Final = 'none' | 'rieul' | 'other';

// 숫자는 읽는 소리 기준: 0영 1일 2이 3삼 4사 5오 6육 7칠 8팔 9구
const DIGIT_FINAL: Record<string, Final> = {
  '0': 'other', '1': 'rieul', '2': 'none', '3': 'other', '4': 'none',
  '5': 'none', '6': 'other', '7': 'rieul', '8': 'rieul', '9': 'none',
};

function finalOf(word: string): Final {
  if (!word) return 'none';
  const ch = word[word.length - 1];
  if (ch in DIGIT_FINAL) return DIGIT_FINAL[ch];
  const code = ch.charCodeAt(0);
  // 한글 음절 영역: 0xAC00 ~ 0xD7A3. (code - 0xAC00) % 28 이 종성 번호(0=없음, 8=ㄹ).
  if (code < 0xac00 || code > 0xd7a3) return 'none';
  const jong = (code - 0xac00) % 28;
  return jong === 0 ? 'none' : jong === 8 ? 'rieul' : 'other';
}

/** 단어의 마지막 글자(숫자는 읽는 소리)에 받침(종성)이 있으면 true. 한글·숫자가 아니면 false. */
export function hasFinalConsonant(word: string): boolean {
  return finalOf(word) !== 'none';
}

/**
 * 받침 유무에 따라 조사를 붙여 반환. josa('서울','은','는') → '서울은'.
 * '으로/로'는 ㄹ 받침 뒤에서 '로'(서울로, 1로).
 */
export function josa(word: string, withBatchim: string, withoutBatchim: string): string {
  const f = finalOf(word);
  if (withBatchim === '으로' && f === 'rieul') return word + withoutBatchim;
  return word + (f !== 'none' ? withBatchim : withoutBatchim);
}
