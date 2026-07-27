// unstable_cache처럼 서버 전용 Next API를 쓰는 코드를 vitest(순수 node 프로세스)에서
// 그대로 import하면 Next의 요청 스코프가 없어 두 군데서 연쇄로 throw한다:
//
// 1. work-unit-async-storage 싱글턴이 모듈 로드 시점에 생성되는데, Next는 그 안에서
//    globalThis.AsyncLocalStorage(Node 전역)가 있는지로 실제 구현 여부를 판단한다.
//    vitest node 환경엔 이게 자동으로 노출돼 있지 않아 FakeAsyncLocalStorage로 폴백하고
//    .run() 호출 시 "Invariant: AsyncLocalStorage accessed in runtime where it is not
//    available"로 즉시 throw한다. 이 파일을 og-coord 같은 모듈보다 먼저 import해
//    node:async_hooks의 실제 구현을 globalThis에 심어야 한다(ESM은 import를 소스 순서대로
//    먼저 평가하므로, 테스트 파일 맨 위에서 import해야 효과가 있다).
//
// 2. workStore(요청 스코프)가 없으면 unstable_cache가 폴백으로 globalThis.__incrementalCache를
//    찾는데 그것도 없으면 "Invariant: incrementalCache missing"으로 throw한다. no-op
//    스텁을 심어 매 호출을 캐시 미스로 처리한다 — 프로덕션 캐싱 로직(unstable_cache 자체)은
//    그대로 두고, 테스트에서만 항상 fresh 계산이 되게 한다(케이스 간 캐시 간섭도 방지).
import { AsyncLocalStorage } from 'node:async_hooks';

interface IncrementalCacheStub {
  isOnDemandRevalidate: boolean;
  generateCacheKey(key: string): Promise<string>;
  get(...args: unknown[]): Promise<undefined>;
  set(...args: unknown[]): Promise<void>;
}

(globalThis as unknown as { AsyncLocalStorage?: typeof AsyncLocalStorage }).AsyncLocalStorage ??=
  AsyncLocalStorage;

(globalThis as unknown as { __incrementalCache?: IncrementalCacheStub }).__incrementalCache = {
  isOnDemandRevalidate: false,
  generateCacheKey: async (key) => key,
  get: async () => undefined,
  set: async () => {},
};
