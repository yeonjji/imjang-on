-- Post.sourceDate의 의미가 경로별로 달라 표시 라벨이 갈린다.
-- 자동 리서치·붙여넣기 경로는 원문 발행일을 취득하지 못해 수집일이 들어가므로 기본값 false.
ALTER TABLE "Post" ADD COLUMN "sourceDateIsPublication" BOOLEAN NOT NULL DEFAULT false;

-- 수동 삽입 스크립트(scripts/board/insert-*.ts)는 사람이 원문 발행일을 확인해 넣었다.
-- 'manual:' 접두사는 그 스크립트들만 사용한다('topic:'은 어드민 자동 생성과 겹쳐 제외).
UPDATE "Post" SET "sourceDateIsPublication" = true WHERE "detectedFrom" LIKE 'manual:%';
