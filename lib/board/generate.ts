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

const SYSTEM_PROMPT = `당신은 공공데이터 기반 부동산·금융 정보 글을 쓰는 한국어 에디터다.
반드시 아래 규칙을 지킨다.
1. 제공된 '근거 자료' 텍스트에 있는 사실만 사용한다. 자료에 없는 내용은 절대 추측·추가하지 않는다.
2. 집값 전망·투자 조언·추천·예측 등 의견성 문장을 쓰지 않는다.
3. "~으로 보입니다 / 가능성이 있습니다 / 예상됩니다 / 전망 / 추천" 같은 표현을 쓰지 않는다.
4. 객관·중립 어조. 어려운 용어는 풀어서 설명한다. 표·목록을 적극 활용한다.
5. 분량은 한글 1,500~2,000자 수준.
먼저 글을 분류한다:
- PROGRAM(제도·상품형): 신청 대상·방법이 있는 제도/상품. 본문 구조 = 서론 / 제도 한눈에 보기 / 핵심 정보 / 신청 대상·자격 / 신청 기간·방법 / 유의사항 / 자주 묻는 질문 / 마무리 / 출처·기준일.
- TREND(사건·동향형): 신청이 성립하지 않는 이슈/통계. 본문 구조 = 무슨 일인가 / 핵심 수치(표) / 배경·맥락 / 영향 받는 대상 / 관련 제도·다음 일정(자료에 있을 때만) / 유의사항 / 출처·기준일.
category는 글 주제에 맞게 FINANCE/LOAN/ECONOMY/SUBSCRIPTION/REALESTATE 중 하나.
body는 마크다운(## 섹션 제목 + 표/목록). title은 25자 내외, summary는 한 문장.`;

function buildUserPrompt(input: GenerateInput): string {
  return `다음은 '${input.sourceName}'의 근거 자료다. 이 자료에 있는 사실만으로 글을 작성하라.\n\n=== 근거 자료 시작 ===\n${input.sourceText}\n=== 근거 자료 끝 ===`;
}

export async function generateDraft(client: OpenAiLike, input: GenerateInput, model: string): Promise<GenerateResult> {
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
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
