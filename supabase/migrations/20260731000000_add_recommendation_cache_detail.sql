-- Add detail to recommendation_cache
--
-- 화면(/api/recommend)이 필요로 하는 추천 상세(분석 구간, 유사 구간, 전략별 점수,
-- 하향 조정 정보)를 요약 컬럼과 함께 JSON으로 저장한다.
-- 이전에는 요약만 저장되어, 상세가 필요한 화면 요청이 프로세스 재시작 후에는
-- DB 캐시가 있어도 전체 재계산을 해야 했다.
--
-- NULL이면 상세 없이 저장된 과거 행으로, 상세가 필요한 조회(requireDetail)에서는
-- 적중으로 치지 않는다. 사전 계산 스크립트를 다시 돌리면 상세가 채워진다.

ALTER TABLE public.recommendation_cache
  ADD COLUMN IF NOT EXISTS detail jsonb;
