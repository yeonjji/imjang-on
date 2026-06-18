/**
 * 손수 작성 게시글 1건을 운영 DB에 DRAFT로 넣는다(게시판 비공개라 노출 X). 검수는 /admin/posts.
 *
 * generate-topic.ts와 달리 OpenAI를 쓰지 않고, 공식 출처에서 확인한 사실만 사람이 직접
 * 기사로 작성한 뒤 createDraft로 저장한다(dedupe·가드레일·slug 재사용). 법령·제도처럼
 * 정확성이 중요한 첫 글을 손으로 검증해 올릴 때 쓴다.
 *
 * 실행:
 *   pnpm tsx scripts/board/insert-manual.ts --dry-run                 # 가드레일·분량만 확인(DB 미접속)
 *   pnpm exec dotenv -e .env.local -- tsx scripts/board/insert-manual.ts   # 운영 DB에 DRAFT 생성
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import type { GenerateResult } from '@/lib/board/generate';
import { createDraft } from '@/lib/board/create-draft';
import { runGuardrails } from '@/lib/board/guardrails';
import { dedupeKey, kstDateISO } from '@/scripts/ingest/posts/keys';

/**
 * 손수 작성한 기사. 본문(body)의 모든 사실은 아래 출처에서 교차 확인했다(2026-06-18 기준).
 * - 대법원 인터넷등기소(iros.go.kr): 등기사항전부증명서 발급
 * - 법제처 찾기쉬운 생활법령정보: 주택임대차보호법 제3조(대항력)·제3조의2(우선변제권)
 * - 주택도시보증공사(HUG) 전세사기예방센터: 등기부·시세·전세가율·보증보험·안심전세앱
 * - 국토교통부: 안심전세앱(2025-05 임대인 동의 없이 조회), 반환보증 공시가 126% 룰
 * - 국세청/정책브리핑: 미납국세 열람제도(보증금 1천만원 초과·계약 후 동의 없이 전국 세무서)
 * - 국가법령정보센터/국토부: 전세사기피해자 특별법(신청기한 2027-05-31, 적용 2025-05-31 이전 계약)
 * 시의성 주의: '전입신고 즉시 대항력' 주임법 개정은 2026-06 현재 추진 중이며 종전 규정(다음 날 0시) 적용.
 */
const SOURCE = {
  sourceName: '국토교통부·HUG·법제처',
  sourceUrl: 'https://www.khug.or.kr/jeonse/web/s03/s030105.jsp',
  sourceDate: new Date('2026-06-18T00:00:00+09:00'),
  detectedFrom: 'manual:jeonse-fraud-prevention',
  sourceExcerpt: `전세사기 예방 안내 — 공식 출처 정리(2026-06-18 기준)
[등기부] 대법원 인터넷등기소(iros.go.kr)에서 등기사항전부증명서를 본인이 직접 발급. 갑구=소유자·압류·경매개시, 을구=근저당 등 선순위 채권. 갑구 '신탁'이면 임대권한이 신탁회사에 있어 신탁원부(인터넷등기소 발급)·수탁회사 동의서 확인 필요. (HUG 전세사기예방센터)
[시세·전세가율] 선순위 채권최고액(실채무의 통상 110~120%)+보증금 합이 매매시세의 70~80% 초과 시 깡통전세 위험. 시세는 국토부 실거래가(rt.molit.go.kr)·KB시세·부동산테크·안심전세앱 교차확인. 안심전세앱 자가진단·집주인 보증사고/체납/악성임대인 조회(2025-05-27부터 임대인 동의 불요). (국토부·HUG)
[세금·보증] 미납국세는 보증금 1천만원 초과 계약이면 계약 후 임대인 동의 없이 전국 세무서 열람(국세청, 2023-04 시행). HUG 반환보증은 보증금이 공시가격 126%(공시가 140%×전세가율 90%) 이내여야 가입, 한도 수도권 7억·비수도권 5억.
[대항력·우선변제권] 주임법 제3조: 인도+전입신고 다음 날 0시 대항력. 제3조의2: 확정일자까지 갖추면 우선변제권. 확정일자 주민센터 600원·인터넷등기소 500원. (법제처) ※'전입신고 즉시 대항력' 개정 추진 중(2026-06 미시행).
[계약·송금] 잔금 다음 날까지 권리변동 금지 특약, 보증보험 가입 불가 시 무효 특약, 등록 개업공인중개사·중개대상물 확인설명서, 보증금은 등기부상 소유자 본인 명의 계좌로만 송금.
[피해 지원] 전세피해지원센터 1533-8119. 특별법: 경·공매 유예, 우선매수권, LH 양도 시 최대 10년 공공임대. 신청기한 2027-05-31, 적용대상 2025-05-31 이전 최초 계약자.`,
} as const;

const GEN: GenerateResult = {
  type: 'PROGRAM',
  category: 'REALESTATE',
  title: '전세사기 피하는 법 — 계약 전 확인부터 보증·특별법까지',
  summary:
    '등기부등본 확인부터 시세·전세가율, 보증금 반환보증, 전입신고·확정일자, 피해 시 지원까지 공공기관이 안내하는 전세사기 예방 절차를 단계별로 정리했습니다.',
  body: `전세보증금은 대부분 가구의 가장 큰 자산입니다. 전세사기는 이 보증금을 돌려받지 못하게 만드는 피해이지만, 상당수는 계약 전·계약 당일·잔금 직후의 확인 절차로 걸러낼 수 있습니다. 국토교통부와 주택도시보증공사(HUG), 법제처가 안내하는 확인 사항을 단계별로 정리했습니다.

## 1. 등기부등본으로 권리관계부터 확인

계약 전 대법원 인터넷등기소(iros.go.kr)에서 '등기사항전부증명서'를 본인이 직접 발급합니다. 임대인이나 중개인이 보여주는 사본 대신 최신본을 직접 떼는 것이 원칙입니다. 갑구에서는 소유자가 계약 상대와 같은지, 압류·가압류·경매개시결정이 있는지 확인합니다. 을구에서는 근저당권 등 보증금보다 앞서는 채권을 확인합니다. 갑구에 '신탁'이 적혀 있으면 임대 권한이 신탁회사에 있으므로, 신탁원부(인터넷등기소에서 발급)를 확인하고 신탁회사의 동의서를 직접 받아야 합니다.

## 2. 시세·전세가율로 깡통전세 거르기

근저당 채권최고액(보통 실제 빚의 110~120%로 설정)과 내 보증금의 합이 매매 시세의 70~80%를 넘으면 깡통전세 위험이 큽니다. 집이 경매로 넘어가면 보증금을 돌려받기 어렵습니다. 시세는 한 곳만 믿지 말고 국토교통부 실거래가(rt.molit.go.kr), KB시세, 한국부동산원 부동산테크, HUG 안심전세앱을 교차 확인합니다. 안심전세앱은 선순위 채권과 보증금을 입력하면 깡통전세 자가진단을 제공하고, 집주인의 보증사고 이력·세금 체납·악성임대인 등록 여부도 조회됩니다(2025년 5월부터 임대인 동의 없이 조회).

## 3. 세금 체납과 보증가입 여부 확인

임대인이 안 낸 세금(당해세)은 확정일자보다 앞서 배당될 수 있습니다. 보증금이 1천만 원을 넘는 계약은 계약 체결 후 임대인 동의 없이도 전국 세무서에서 미납국세를 열람할 수 있습니다. 또한 HUG 전세보증금반환보증은 보증금이 공시가격의 126%(공시가격 140%×전세가율 90%) 이내여야 가입됩니다(한도: 수도권 7억 원·비수도권 5억 원). 가입이 거절되는 매물은 그 자체로 위험 신호이므로, 계약 전 가입 가능 여부부터 확인합니다.

## 4. 전입신고·확정일자는 잔금일에 바로

주택의 인도(실제 거주)와 전입신고를 마치면 그 다음 날 0시부터 대항력이 생깁니다(정부는 '전입신고 즉시' 발생하도록 법 개정을 추진 중이며, 2026년 6월 현재는 종전 규정이 적용됩니다). 여기에 확정일자까지 받으면 경매·공매에서 후순위보다 먼저 보증금을 받는 우선변제권이 생깁니다. 확정일자는 잔금일에 주민센터(600원)나 인터넷등기소(500원)에서 함께 받습니다. 대항력이 다음 날 0시에 생기는 시차가 있으므로, 임대인이 잔금일에 근저당을 새로 잡지 않는지 잔금 직전·직후 등기부를 다시 확인합니다.

## 5. 계약·송금 단계에서 지킬 것

계약서에는 '잔금 다음 날까지 근저당 설정·소유권 이전을 하지 않으며, 위반 시 계약 무효·손해배상' 특약과 '보증보험 가입이 거절되면 계약 무효·보증금 즉시 반환' 특약을 넣습니다. 정상 영업 중인 등록 개업공인중개사인지 확인하고 중개대상물 확인·설명서를 서면으로 받습니다. 보증금은 예외 없이 등기부상 소유자 본인 명의 계좌로만 보냅니다. 대리계약이라면 인감증명서가 첨부된 위임장과 신분증을 대조하고, 소유자 본인과 직접 통화로 확인합니다.

## 피해를 당했다면

전세피해지원센터(국번 없이 1533-8119)에서 법률·주거·금융 상담을 한 번에 받을 수 있습니다. 전세사기피해자로 인정되면 경·공매 유예, 피해주택 우선매수권, 우선매수권을 LH에 넘기면 최대 10년 공공임대 거주 같은 지원을 받습니다. 신청 기한은 2027년 5월 31일까지이며, 2025년 5월 31일 이전에 최초로 임대차계약을 체결한 임차인이 대상입니다.`,
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const guard = runGuardrails({ body: GEN.body, sourceName: SOURCE.sourceName, sourceUrl: SOURCE.sourceUrl });
  const charCount = GEN.body.replace(/\s/g, '').length;

  console.log(
    `\n[${GEN.type}/${GEN.category}] ${GEN.title}\n${GEN.summary}\n${'-'.repeat(60)}\n${GEN.body}\n${'-'.repeat(60)}\n` +
      `가드레일: ${guard.ok ? 'PASS ✅' : 'FAIL ❌ → ' + guard.violations.join(', ')} (공백제외 ${charCount}자)\n`,
  );

  if (dryRun) {
    logger.info({ guardOk: guard.ok, charCount }, 'DRY RUN — DB 미기록');
    return;
  }
  if (!guard.ok) {
    logger.error({ violations: guard.violations }, '가드레일 실패 — 미생성');
    process.exitCode = 1;
    return;
  }

  const res = await createDraft({
    gen: GEN,
    sourceName: SOURCE.sourceName,
    sourceUrl: SOURCE.sourceUrl,
    sourceDate: SOURCE.sourceDate,
    sourceExcerpt: SOURCE.sourceExcerpt.slice(0, 4000),
    dedupeKey: dedupeKey(SOURCE.sourceUrl),
    dateISO: kstDateISO(SOURCE.sourceDate),
    detectedFrom: SOURCE.detectedFrom,
  });

  if (res.status === 'created') {
    logger.info({ slug: res.slug }, 'DRAFT 생성 완료 — /admin/posts에서 검수');
    await notify('info', `전세사기 예방 토픽 초안 1건 대기: ${GEN.title}`, { slug: res.slug });
  } else if (res.status === 'duplicate') {
    logger.info('이미 생성된 출처(dedupeKey 중복) — 건너뜀');
  } else {
    logger.error({ violations: res.violations }, 'createDraft rejected');
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    logger.error({ err }, 'insert-manual fatal');
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
