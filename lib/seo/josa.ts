/** 단어의 마지막 글자에 받침(종성)이 있으면 true. 한글이 아니면 false. */
export function hasFinalConsonant(word: string): boolean {
  if (!word) return false;
  const code = word.charCodeAt(word.length - 1);
  // 한글 음절 영역: 0xAC00 ~ 0xD7A3. (code - 0xAC00) % 28 !== 0 이면 종성 있음.
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

/** 받침 유무에 따라 조사를 붙여 반환. josa('서울','은','는') → '서울은'. */
export function josa(word: string, withBatchim: string, withoutBatchim: string): string {
  return word + (hasFinalConsonant(word) ? withBatchim : withoutBatchim);
}
