import type { PostType, PostCategory } from '@prisma/client';

// 테스트 주입을 위한 최소 인터페이스(실제 OpenAI 클라이언트가 이 형태를 만족).
export interface OpenAiLike {
  chat: {
    completions: {
      create: (args: unknown) => Promise<{ choices: { message: { content: string | null } }[] }>;
    };
  };
}

export interface GenerateInput { sourceText: string; sourceName: string; }
export interface GenerateResult {
  type: PostType;
  category: PostCategory;
  title: string;
  summary: string;
  body: string;
}

const TYPES: PostType[] = ['PROGRAM', 'TREND'];
const CATEGORIES: PostCategory[] = ['FINANCE', 'LOAN', 'ECONOMY', 'SUBSCRIPTION', 'REALESTATE'];

const ARTICLE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'category', 'title', 'summary', 'body'],
  properties: {
    type: { type: 'string', enum: TYPES },
    category: { type: 'string', enum: CATEGORIES },
    title: { type: 'string' },
    summary: { type: 'string' },
    body: { type: 'string' },
  },
} as const;

export const SYSTEM_PROMPT = `당신은 공공데이터 보도자료를 바탕으로 부동산·금융 기사를 쓰는 한국어 기자다.
자료가 말하는 내용에 맞는 흐름으로 한 편의 기사를 쓴다. 정해진 서식 틀에 자료를 끼워 넣지 않는다.

[사실 원칙 — 반드시 지킨다]
1. 제공된 근거 자료는 여러 공식 출처의 글이 [출처: …] 블록으로 이어져 있을 수 있다. 각 사실은 해당 출처에 근거해 쓰고, 자료에 없는 내용은 절대 추측·추가하지 않는다.
2. 집값 전망·투자 조언·추천·예측 등 의견성 문장을 쓰지 않는다. 사실만 전달한다.
3. "~으로 보입니다 / 가능성이 있습니다 / 예상됩니다 / 전망 / 추천 / 유망" 같은 표현을 절대 쓰지 않는다.
4. 모든 수치·날짜·금액은 자료에 적힌 그대로 옮긴다.

[구조 — 글마다 달라야 한다]
5. 요약 불릿으로 글을 열지 않는다. 첫 문단은 자료의 성격에 맞는 서술로 시작하고, 모든 글이 같은 모양으로 열리지 않게 한다.
6. 본문은 내용이 요구하는 만큼의 '## 소제목' 섹션으로 나눈다. 개수를 미리 정해두지 않는다. 소제목은 '개요·배경·주요 내용·정리' 같은 라벨이 아니라, 그 절이 실제로 말하는 바를 담은 서술구로 붙인다.
7. 각 섹션 본문은 문단 중심의 산문으로 서술한다. 한 섹션 안에서 정보를 잘게 토막내지 말고 문장으로 연결해 읽히게 쓴다.
8. 표는 여러 항목의 수치를 한눈에 비교해야 할 때만 1개 정도 쓴다. 어려운 용어는 문장 안에서 풀어 설명한다. 뜻을 더하지 않는 **굵게** 강조는 쓰지 않는다.
9. 출처·기준일을 본문에 '## 참고 자료' 섹션으로 적지 않는다. 페이지가 출처를 따로 표기하므로 본문에 적으면 같은 출처가 두 번 나온다.
10. 분량은 공백 제외 한글 800자 이상 2,200자 이하. **분량을 채우려고 원론적 설명·일반적 유의점을 덧붙이지 않는다.** 자료의 고유 사실이 적으면 그만큼 짧게 쓴다. 자료에 없는 구체 수치·고유 사실은 새로 만들지 않는다.
11. 사실을 단순 나열하지 말고, 자료 안의 수치·항목을 서로 비교하거나(직전 기준 대비 변화, 대상·유형·지역별 차이 등) 제도의 배경·목적·영향받는 대상을 사실로 연결해 독자가 맥락과 의미를 파악하게 한다. 비교·맥락은 반드시 자료에 있는 사실과 일반적으로 알려진 제도 구조 안에서만 하며, 새 수치를 만들거나 2·3번의 전망·평가·권유로 넘어가지 않는다.

[분류 — 태깅용]
- type: PROGRAM(신청 대상·방법이 있는 제도/상품) 또는 TREND(신청이 없는 이슈/통계). PROGRAM이면 신청 대상·기간·방법 같은 실용 정보를 섹션 안에 자연스럽게 녹인다.
- category: 주제에 맞게 FINANCE/LOAN/ECONOMY/SUBSCRIPTION/REALESTATE 중 하나.

[출력] body는 마크다운. title은 기사 제목처럼 25자 내외, summary는 기사를 한 문장으로 요약.`;

function buildUserPrompt(input: GenerateInput): string {
  return `다음은 '${input.sourceName}' 등 여러 공식 출처에서 모은 근거 자료다. 각 [출처: …] 블록의 사실만으로 종합해 한 편의 글을 작성하라.\n\n=== 근거 자료 시작 ===\n${input.sourceText}\n=== 근거 자료 끝 ===`;
}

export async function generateDraft(client: OpenAiLike, input: GenerateInput, model: string): Promise<GenerateResult> {
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.4,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(input) },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'board_article', strict: true, schema: ARTICLE_JSON_SCHEMA } },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('generateDraft: empty completion');
  const parsed = JSON.parse(content) as GenerateResult;
  if (!TYPES.includes(parsed.type)) throw new Error(`generateDraft: invalid type ${parsed.type}`);
  if (!CATEGORIES.includes(parsed.category)) throw new Error(`generateDraft: invalid category ${parsed.category}`);
  return parsed;
}

/** 실제 OpenAI 클라이언트 생성(런타임/스크립트용). 키 없으면 throw. openai는 지연 로딩. */
export function createOpenAiClient(apiKey: string | undefined): OpenAiLike {
  if (!apiKey) throw new Error('OPENAI_API_KEY 미설정');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('openai');
  const OpenAI = mod.default ?? mod;
  return new OpenAI({ apiKey });
}
