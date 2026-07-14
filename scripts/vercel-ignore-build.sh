#!/usr/bin/env bash
# Vercel Ignored Build Step.
# 종료 코드 규칙(Vercel): exit 0 = 빌드 스킵, exit 1 = 빌드 진행.
# 런타임에 영향 없는 파일(*.md / docs/ / RESEARCH/ / .github/)만 바뀐 커밋은 빌드를 스킵해 Build CPU를 절감한다.
set -uo pipefail

# 직전 커밋이 없으면(shallow clone/최초 커밋) 안전하게 빌드한다.
if ! git rev-parse "HEAD^" >/dev/null 2>&1; then
  echo "no previous commit — building."
  exit 1
fi

changed="$(git diff --name-only "HEAD^" "HEAD")"
if [ -z "$changed" ]; then
  echo "no file changes detected — building."
  exit 1
fi

# 비런타임 경로를 제외하고 남는 변경이 있으면 빌드, 없으면(=전부 문서) 스킵.
runtime_changed="$(printf '%s\n' "$changed" | grep -vE '(^|/)[^/]+\.md$|^docs/|^RESEARCH/|^\.github/' || true)"
if [ -z "$runtime_changed" ]; then
  echo "only docs/non-runtime files changed — skipping build."
  exit 0
fi

echo "runtime files changed — building:"
printf '%s\n' "$runtime_changed"
exit 1
