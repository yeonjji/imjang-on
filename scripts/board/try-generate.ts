/**
 * 일회용 검증 스크립트: 새 글생성 프롬프트(기사형)가 실제로 어떤 본문을 만드는지 눈으로 확인.
 * 가상의 보도자료 샘플 2개(디딤돌·청약)를 넣고 generateDraft 결과 + 가드레일 통과여부를 출력한다.
 *
 * 실행: OPENAI_API_KEY 필요.
 *   dotenv -e .env.local -- tsx scripts/board/try-generate.ts
 *   또는  OPENAI_API_KEY=sk-... tsx scripts/board/try-generate.ts
 *   모델 변경:  OPENAI_BOARD_MODEL=gpt-4.1 ...
 */
import { generateDraft, createOpenAiClient } from '@/lib/board/generate';
import { runGuardrails } from '@/lib/board/guardrails';

const MODEL = process.env.OPENAI_BOARD_MODEL ?? 'gpt-4.1-mini';

const SAMPLES = [
  {
    sourceName: '국토교통부',
    sourceUrl: 'https://www.molit.go.kr/board/example-didimdol',
    text: `[국토교통부 보도자료] 2026.6.15.
제목: 내 집 마련 디딤돌 대출, 7월부터 한도 상향

□ 국토교통부는 무주택 실수요자의 주거비 부담을 덜기 위해 디딤돌 대출의 대출 한도를 7월 1일부터 상향한다고 밝혔다.
□ 지원 대상: 무주택 세대주, 부부합산 연소득 6천만원 이하(생애최초·신혼·2자녀 이상은 7천만원 이하), 순자산 4억 6,900만원 이하.
□ 대출 한도: 일반 2억 5천만원 → 3억원, 생애최초 3억원 → 3억 5천만원으로 확대.
□ 대상 주택: 주택가격 5억원 이하, 전용면적 85㎡ 이하(수도권 외 읍·면은 100㎡ 이하).
□ 금리: 소득·만기에 따라 연 2.45%~3.55% (고정금리).
□ 신청 기간·방법: 2026년 7월 1일부터 상시. 주택도시기금 '기금e든든' 누리집 또는 우리·국민·신한·농협·기업은행 영업점.
□ 유의사항: 대출 신청일 기준 무주택 요건을 충족해야 하며, 기존 주택담보대출 보유 시 제한될 수 있다. 자세한 자격 요건은 기금e든든에서 확인.`,
  },
  {
    sourceName: '국토교통부',
    sourceUrl: 'https://www.molit.go.kr/board/example-newhome',
    text: `[국토교통부 보도자료] 2026.6.12.
제목: 뉴:홈 나눔형 사전청약, OO신도시 1,200가구 공급

□ 국토교통부는 OO신도시 A-3블록에서 공공분양주택 '뉴:홈' 나눔형 1,200가구의 사전청약을 시행한다.
□ 공급 규모: 전용 59㎡ 700가구, 전용 84㎡ 500가구, 총 1,200가구.
□ 공급 유형: 나눔형(시세 70% 이하 분양 후 환매 시 시세차익의 70% 수분양자 귀속).
□ 신청 자격: 입주자 모집공고일 현재 무주택 세대구성원, 해당 지역 거주 요건 충족. 일반공급·특별공급(신혼부부·생애최초·다자녀 등)으로 구분.
□ 추정 분양가: 전용 59㎡ 기준 약 3억 8천만원, 전용 84㎡ 기준 약 5억 2천만원.
□ 일정: 입주자 모집공고 2026.7.10 / 사전청약 접수 2026.7.20~7.24 / 당첨자 발표 2026.8.14.
□ 신청 방법: 한국부동산원 '청약홈' 누리집.
□ 본 청약 및 입주는 추후 별도 공고하며, 사전청약 당첨자는 본 청약 시 자격을 다시 확인한다.`,
  },
];

async function main() {
  const client = createOpenAiClient(process.env.OPENAI_API_KEY);
  console.log(`모델: ${MODEL}\n`);

  for (const s of SAMPLES) {
    console.log('='.repeat(70));
    console.log(`[입력] ${s.sourceName}`);
    console.log('='.repeat(70));
    const gen = await generateDraft(client, { sourceText: s.text, sourceName: s.sourceName }, MODEL);
    const guard = runGuardrails({ body: gen.body, sourceName: s.sourceName, sourceUrl: s.sourceUrl });
    const charCount = gen.body.replace(/\s/g, '').length;

    console.log(`type:     ${gen.type}`);
    console.log(`category: ${gen.category}`);
    console.log(`title:    ${gen.title}`);
    console.log(`summary:  ${gen.summary}`);
    console.log(`\n--- body (공백제외 ${charCount}자) ---\n`);
    console.log(gen.body);
    console.log(`\n--- 가드레일: ${guard.ok ? 'PASS ✅' : 'FAIL ❌'} ${guard.violations.length ? '→ ' + guard.violations.join(', ') : ''}`);
    console.log('');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
