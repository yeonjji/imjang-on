/**
 * 손수 작성 게시글 1건을 운영 DB에 DRAFT로 넣는다(검수는 /admin/posts).
 * insert-manual.ts와 동일 패턴(OpenAI 미사용, createDraft 재사용 → dedupe·가드레일·slug).
 *
 * 주제: HUG 든든전세주택 수시 입주자 모집 공고[2026.7.24] — 모집일정·자격·물량·임대조건·서류.
 * 본문의 모든 사실은 HUG 공고문 원문(jeonse_notice_260724.pdf, 15p)에서 직접 확인했다.
 * 출처 URL은 PDF 직링크 대신 '모집공고 및 입주신청' 페이지를 쓴다 — 접수 마감 후 첨부파일이
 * 내려가도 링크가 깨지지 않고, 독자가 다음 회차 공고까지 같은 자리에서 확인할 수 있다.
 *
 * 실행:
 *   pnpm tsx scripts/board/insert-hug-ddeundeun-jeonse.ts --dry-run                    # 가드레일·분량만 확인(DB 미접속)
 *   pnpm exec dotenv -e .env.local -- tsx scripts/board/insert-hug-ddeundeun-jeonse.ts # 운영 DB에 DRAFT 생성
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import type { GenerateResult } from '@/lib/board/generate';
import { createDraft } from '@/lib/board/create-draft';
import { runGuardrails } from '@/lib/board/guardrails';
import { dedupeKey, kstDateISO } from '@/scripts/ingest/posts/keys';

const SOURCE = {
  sourceName: '주택도시보증공사(HUG)',
  sourceUrl: 'https://www.khug.or.kr/jeonse/web/s07/s070102.jsp',
  // @db.Date 컬럼은 UTC 날짜로 잘리므로 KST 자정(=전날 15:00Z)을 넣으면 기준일이 하루 밀린다.
  // 슬러그용 kstDateISO는 +9h를 되돌려 맞지만, 저장된 sourceDate는 어긋나므로 UTC 자정으로 넣는다.
  sourceDate: new Date('2026-07-24T00:00:00Z'),
  detectedFrom: 'manual:hug-ddeundeun-jeonse-260724',
  sourceExcerpt: `HUG 든든전세주택 수시 입주자 모집 공고[2026.7.24] — 공고문 원문 정리
[제도] HUG가 다세대·연립·오피스텔(주거용)·아파트를 매입하여 무주택세대주 및 구성원에게 시중 시세의 90% 이하 수준의 임대보증금으로 임대하는 주택. 매입유형은 경매 등 매입형과 협의매입형으로 분류(협의매입형은 임대의무기간 5년 이후 임대인 변경 가능).
[기준일] 모집공고일 2026.7.24.(금) = 입주자격 판단 기준일.
[신청접수] 7.24(금) 10:00 ~ 8.7(금) 17:00. 안심전세포털(https://www.khug.or.kr/jeonse/index.jsp) 온라인 접수만 가능. 온라인(PC) 접수는 기간 중 24시간 가능(시작일·마감일 제외). 신청 절차: 모집공고·입주신청 페이지 접속 → 주택별 상세정보 확인 → 입주신청 버튼·입주자격 자가진단 → 휴대폰 인증 로그인 → 개인정보 입력 및 실명인증 → 동의 → 신청 완료. 접수기간 내 변경·취소 가능, 마감 후 변경 불가.
[입주자격] 공고일 현재 무주택세대구성원. 유주택세대의 세대분리예정자 신청 불가. 거주지역 제한 없음. 자격은 공고일부터 입주 시까지 계속 유지. 분양권·입주권 보유 시 주택 소유자로 간주될 수 있음. 민법상 미성년자(만 19세 미만)는 신청 불가(예외: 자녀가 있는 미성년 세대주, 직계존속 사망·실종선고·행방불명 등으로 형제자매를 부양하는 미성년 세대주). 과거 공공임대 불법양도·전대 적발 후 4년 미경과자가 세대구성원에 있으면 선정 불가. ※공고문 전문에 소득·자산 기준 조항 없음('소득'·'자산' 단어 미등장).
[모집단위] 1세대당 1개 주택 선택 신청, 중복신청 시 전부 무효.
[공급물량] 총 300호. 매입유형·소재지·면적·임대조건 세부내역은 HUG 안심전세포털 ⇒ 든든전세주택 참조. 지역별 배분표는 공고문에 없음. 예비입주자 계약 등으로 호수 변경 가능.
[임대조건] 시중 전세시세의 90% 이하 수준 전세보증금. 임대기간 2년, 재계약 최대 3회(자격 유지 시 최장 8년). 재계약 시 관계법령 범위 내 보증금 인상 가능. 관리비는 HUG가 아닌 관리단(관리주체)에 납부. 대규모 수선 하자는 HUG, 소규모 하자는 임차인 부담.
[선정방법] 모집인원은 공급대상 주택의 2배수(서류제출대상자 2배수). 입주신청자 대상 무작위 추첨으로 당첨자·예비입주자 결정. 당첨자 1배수+예비입주자 1배수 이내 선정. 예비입주자 지위는 순번 발표일로부터 90일 유지.
[일정] 서류제출대상자 발표 8.10(월) 17:00(예정) → 서류제출 ~8.18(화) 17:00 → 자격검증 및 소명안내 8.19(수)~10.29(목) → 당첨자·예비입주자 순번 발표 10.30(금) 14:00(예정) → 주택열람 11월~12월 → 계약체결 별도안내. 발표는 HUG 안심전세포털(든든전세주택→신청내역 조회/변경/취소)에서 조회.
[제출서류] 서류제출대상자만 제출. 공통: 개인정보 수집·이용 및 제3자 제공 동의서, 금융정보 등 제공 동의서(세대구성원 전원 자필 서명), 입주신청자 및 배우자 주민등록표등본, 신청자 본인 가족관계증명서('상세' 발급). 추가: 외국인 배우자·외국인 직계 존비속이 세대구성원인 경우 외국인등록증 사본 또는 국내거소신고증. 공고일(26.7.24) 이후 발급분만 유효, 접수 파일 형식은 PDF만 허용, 제출서류 미반환.
[유의사항] 서류제출대상자로 선정되고 기한 내 미제출 시 다음 회차 공고 신청 제한. 입주 전 기존 주택도시기금 대출 상환 필요(은행이 대출 목적물 변경 승인 시 예외). 입주 전 타 임대주택 퇴거 필요. 입주 후 주택 소유 시 계약 해지사유. 임차권 양도·전대 금지. 입주지정: 임대차계약서상 입주개시일(계약체결일로부터 3개월 내) 입주 완료.
[문의] HUG 콜센터 1566-9009(평일 09:00~18:00), 든든전세주택 위탁관리업체 032-324-4851.`,
} as const;

const GEN: GenerateResult = {
  type: 'PROGRAM',
  category: 'REALESTATE',
  title: 'HUG 든든전세주택 수시 모집 300호 — 8월 7일 17시까지 온라인 신청',
  summary:
    '주택도시보증공사가 2026년 7월 24일 공고한 든든전세주택 수시 입주자 모집은 전국 300호를 대상으로 8월 7일 오후 5시까지 접수합니다. 공고일 기준 무주택세대구성원이면 신청할 수 있고, 무작위 추첨으로 당첨자를 정합니다.',
  body: `주택도시보증공사(HUG)가 든든전세주택 수시 입주자를 모집합니다. 2026년 7월 24일 공고한 이번 모집은 전국 300호가 대상이며, 신청은 8월 7일(금) 오후 5시에 마감됩니다. 든든전세주택은 HUG가 다세대·연립·오피스텔(주거용)·아파트를 매입해 무주택 세대에 시중 시세의 90% 이하 보증금으로 임대하는 주택입니다.

## 신청 기간과 방법

접수는 7월 24일(금) 오전 10시부터 8월 7일(금) 오후 5시까지입니다. HUG 안심전세포털을 통한 온라인 접수만 받으며, 방문이나 우편 접수는 하지 않습니다. 주택별 상세정보 페이지에서 입주자격 자가진단을 거친 뒤 휴대폰 인증과 실명인증을 마치면 신청이 완료됩니다. 접수 기간에는 신청 내역을 변경하거나 취소할 수 있지만 마감 이후에는 변경할 수 없습니다. 한 세대는 주택 한 곳만 골라 신청해야 하며, 중복 신청하면 전부 무효 처리됩니다.

## 신청 자격

공고일인 2026년 7월 24일 기준 무주택세대구성원이면 신청할 수 있습니다. 공고문은 입주자격으로 무주택 요건만 정하고 있으며 소득이나 자산 기준은 두고 있지 않습니다. 지금 살고 있는 지역에 따른 제한도 없습니다.

다만 유주택 세대의 세대분리예정자는 신청할 수 없고, 분양권이나 입주권을 가진 경우 주택 소유자로 간주될 수 있습니다. 민법상 미성년자(만 19세 미만)도 원칙적으로 신청 대상이 아니며, 자녀가 있는 미성년 세대주이거나 직계존속의 사망 등으로 형제자매를 부양하는 미성년 세대주만 예외로 신청할 수 있습니다. 신청 자격은 공고일부터 입주할 때까지 계속 유지해야 합니다.

## 공급 물량과 임대조건

이번 공고의 공급 대상은 총 300호입니다. 매입 유형과 주택 소재지, 면적, 임대조건 같은 세부 내역은 안심전세포털의 든든전세주택 메뉴에서 주택별로 확인할 수 있습니다. 임대보증금은 시중 전세시세의 90% 이하 수준이고, 임대 기간은 2년으로 재계약을 최대 3회까지 할 수 있어 자격을 유지하면 최장 8년 거주할 수 있습니다. 관리비는 HUG가 아니라 해당 건물의 관리단에 납부하며, 대규모 수선 하자는 HUG가, 소규모 하자는 임차인이 부담합니다.

## 선정 방법과 발표 일정

모집 인원은 공급 호수의 2배수이며, 신청자를 대상으로 무작위 추첨해 당첨자와 예비입주자를 정합니다. 공고문은 청약통장 가입이나 가점을 선정 요건으로 정하고 있지 않습니다. 예비입주자 지위는 순번 발표일부터 90일간 유지됩니다.

일정은 서류제출대상자 발표 8월 10일(월) 오후 5시, 서류 제출 8월 18일(화) 오후 5시까지, 자격 검증 8월 19일부터 10월 29일까지입니다. 당첨자와 예비입주자 순번은 10월 30일(금) 오후 2시에 발표하고, 주택 열람은 11~12월, 계약 체결 일정은 별도 안내합니다. 발표 내용은 안심전세포털의 신청내역 조회 화면에서 확인합니다.

## 제출 서류

서류는 신청 단계가 아니라 서류제출대상자로 뽑힌 사람만 냅니다. 공통 서류는 개인정보 수집·이용 동의서, 금융정보 등 제공 동의서, 신청자와 배우자의 주민등록표등본, 신청자 본인의 가족관계증명서(상세)입니다. 외국인 배우자나 외국인 직계 존·비속이 세대구성원이면 외국인등록증 사본을 추가로 냅니다. 공고일인 7월 24일 이후 발급한 서류만 인정되며, 파일은 PDF 형식만 접수합니다.

## 신청 전 확인할 점

서류제출대상자로 뽑히고도 기한 안에 서류를 내지 않으면 다음 회차 공고 신청이 제한됩니다. 입주 전에는 기존에 받은 주택도시기금 대출을 갚아야 하고(은행이 대출 목적물 변경을 승인하면 예외), 다른 임대주택에 살고 있다면 퇴거해야 합니다. 입주한 뒤 주택을 소유하게 되면 계약 해지 사유가 되며, 임차권을 넘기거나 전대하는 것도 금지됩니다. 협의매입형 주택은 최초 임대개시일부터 5년이 지나면 임대인이 바뀔 수 있습니다. 공고문 원문은 안심전세포털 모집공고 게시판에서 내려받을 수 있고, 문의는 HUG 콜센터(1566-9009)로 하면 됩니다.`,
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
    await notify('info', `든든전세주택 모집공고 초안 1건 대기: ${GEN.title}`, { slug: res.slug });
  } else if (res.status === 'duplicate') {
    logger.info('이미 생성된 출처(dedupeKey 중복) — 건너뜀');
  } else {
    logger.error({ violations: res.violations }, 'createDraft rejected');
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    logger.error({ err }, 'insert-hug-ddeundeun-jeonse fatal');
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
