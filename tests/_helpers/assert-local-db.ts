// 테스트/시드 코드는 region·property·transaction을 무필터로 전체 삭제한다.
// DATABASE_URL이 운영(Supabase 등)을 가리킨 상태로 실행되면 운영 데이터가 통째로 날아간다.
// 어떤 삭제보다 먼저 호출해, 로컬 DB가 아니면 즉시 중단한다.
// 의도적인 원격 실행은 E2E_ALLOW_REMOTE_WIPE=1로만 허용한다.
export function assertLocalDatabase(): void {
  if (process.env.E2E_ALLOW_REMOTE_WIPE === '1') return;
  const url = process.env.DATABASE_URL ?? '';
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    /* URL 파싱 실패 시 host '' → 비로컬로 간주하여 중단 */
  }
  const isLocal =
    host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local');
  if (!isLocal) {
    throw new Error(
      `assertLocalDatabase: 비로컬 DB(host=${host || 'unknown'})에 대한 파괴적 실행을 거부합니다. ` +
        `이 코드는 region/property/transaction 전체를 삭제합니다. ` +
        `DATABASE_URL을 로컬 테스트 DB로 두거나, 의도적이라면 E2E_ALLOW_REMOTE_WIPE=1로 재실행하세요.`,
    );
  }
}
