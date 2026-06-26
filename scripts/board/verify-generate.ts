/**
 * 검증 전용(수동): 주어진 출처 텍스트로 generateDraft를 mini·gpt-4.1 양쪽으로 돌려
 * 공백 제외 글자수와 가드레일 PASS/FAIL을 출력한다. DB에는 접근하지 않는다(저장·게시 없음).
 *
 * GitHub Actions(verify-board-generate.yml)에서 workflow_dispatch로 호출. 입력은 환경변수로 받는다:
 *   VERIFY_SOURCE_NAME  출처명(기본 '한국거래소')
 *   VERIFY_SOURCE_TEXT  근거 자료 본문(비우면 내장 레버리지 ETF 샘플 사용)
 *   VERIFY_MODELS       'both' | 'mini' | 'full' (기본 both)
 *
 * 로컬 실행:
 *   OPENAI_API_KEY=sk-... VERIFY_MODELS=both tsx scripts/board/verify-generate.ts
 */
import { generateDraft, createOpenAiClient } from '@/lib/board/generate';
import { runGuardrails } from '@/lib/board/guardrails';

const MINI = 'gpt-4.1-mini';
const FULL = 'gpt-4.1';

// 사실이 빈약한 짧은 출처(레버리지 ETF) — 1,000자 하한을 못 넘기던 대표 케이스.
const ETF_SAMPLE = {
  sourceName: '한국거래소',
  text: `[한국거래소 보도자료] 2026.6.20. 제목: 코스피200 2배 추종 'OO 레버리지 ETF' 신규 상장. □ 한국거래소는 6월 25일 유가증권시장에 'OO KOSPI200 레버리지 ETF'를 신규 상장한다. □ 기초지수는 코스피200이며, 기초지수 일일 수익률의 2배를 추종한다. □ 운용사는 OO자산운용, 총보수는 연 0.45%다. □ 상장 좌수는 1,000만 좌, 1좌당 기준가격은 10,000원이다. □ 분배금은 연 1회(매년 12월) 지급할 예정이다.`,
};

function pickModels(v: string | undefined): string[] {
  if (v === 'mini') return [MINI];
  if (v === 'full') return [FULL];
  return [MINI, FULL];
}

async function main() {
  const client = createOpenAiClient(process.env.OPENAI_API_KEY);
  const inputText = process.env.VERIFY_SOURCE_TEXT?.trim();
  const sourceName = process.env.VERIFY_SOURCE_NAME?.trim() || ETF_SAMPLE.sourceName;
  const sourceText = inputText || ETF_SAMPLE.text;
  const models = pickModels(process.env.VERIFY_MODELS);

  console.log(`출처명: ${sourceName}`);
  console.log(`소스:   ${inputText ? `사용자 입력(${sourceText.length}자)` : '내장 레버리지 ETF 샘플'}`);
  console.log(`모델:   ${models.join(', ')}\n`);

  const summary: { model: string; chars: number; ok: boolean; note: string }[] = [];

  for (const model of models) {
    console.log('='.repeat(70));
    console.log(`[모델: ${model}]`);
    console.log('='.repeat(70));
    try {
      const gen = await generateDraft(client, { sourceText, sourceName }, model);
      const chars = gen.body.replace(/\s/g, '').length;
      const guard = runGuardrails({ body: gen.body, sourceName, sourceUrl: 'https://example.test/verify' });
      summary.push({ model, chars, ok: guard.ok, note: guard.violations.join(', ') });
      console.log(`title:  ${gen.title}`);
      console.log(`글자수(공백제외): ${chars}자`);
      console.log(`가드레일: ${guard.ok ? 'PASS ✅' : 'FAIL ❌'}${guard.violations.length ? ' → ' + guard.violations.join(', ') : ''}`);
      console.log(`\n--- body ---\n${gen.body}\n`);
    } catch (err) {
      summary.push({ model, chars: 0, ok: false, note: String(err) });
      console.error(`[${model}] 생성 실패:`, err);
    }
  }

  console.log('='.repeat(70));
  console.log('=== 요약 (글자수 · PASS/FAIL) ===');
  for (const s of summary) {
    console.log(`${s.model.padEnd(14)} ${String(s.chars).padStart(5)}자  ${s.ok ? 'PASS ✅' : 'FAIL ❌'}${s.note ? '  (' + s.note + ')' : ''}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
