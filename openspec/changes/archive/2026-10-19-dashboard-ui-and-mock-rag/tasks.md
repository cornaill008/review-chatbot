# Tasks

## 1. 의존성·샘플 데이터 준비

- [x] 1.1 `@langchain/core`, `@langchain/anthropic`, `papaparse`(+`@types/papaparse`)를 설치하고 `npm run build`가 통과하는지 확인 (`@langchain/pinecone`, 임베딩 라이브러리는 설치하지 않음)
- [x] 1.2 `.env.example`에 `ANTHROPIC_API_KEY`, `USE_MOCK`을 추가하고 `.env*` 로컬 파일이 `.gitignore`에 포함되는지 확인
- [x] 1.3 `samples/review.csv`(컬럼: `rating,author,title,content`, 한글 리뷰 20건 이상)를 준비하고 UTF-8로 올바르게 열리는지 확인

## 2. Mock 데이터 계층

- [x] 2.1 `src/lib/types.ts`(`Review`, `SourceReview`, API 응답 타입)와 `csv.ts`를 구현하고, 정상·필수 컬럼 누락·빈 행 케이스 단위 테스트가 통과하는지 확인
- [x] 2.2 `search.ts`(토큰화, 제목 가중치 점수, 점수>0 상위 5건)를 구현하고, 5건 초과·0건·동점 케이스 단위 테스트가 통과하는지 확인
- [x] 2.3 `ReviewRepository` 인터페이스(`index`, `search`, `isIndexed`, `count`, `appendMessage`, `getHistory`), `globalThis` 기반 Mock 구현, `USE_MOCK !== 'false'` 팩토리를 구현하고, 재인덱싱 시 중복되지 않고 `count()`가 적재 건수와 같은 테스트가 통과하는지 확인

## 3. API 라우트

- [x] 3.1 구현 전 `node_modules/next/dist/docs/`의 Route Handler 가이드를 확인한 뒤 `src/app/api/index-data/route.ts`를 구현하고, `curl -X POST`로 `{ success: true, data: { count } }`와 파일 없음 오류(`success: false`)를 확인
- [x] 3.2 `chain.ts`(`claude-haiku-4-5`, 근거 기반 한국어 프롬프트, 최근 6개 히스토리)를 구현하고, 0건 검색 시 LLM을 호출하지 않는 테스트가 통과하는지 확인
- [ ] 3.3 `src/app/api/chat/route.ts`를 구현하고 `curl`로 정상 응답(`answer`, `sources`, API 키 필요), 빈 message, 미인덱싱 오류가 규격대로 나오는지 확인
- [x] 3.4 API 키가 없으면 답변 생성을 생략하고 검색 결과 JSON을 `answer`로 응답하도록 `retrieval-json.ts`와 `/api/chat` 분기를 구현하고, 키 없음/키 있음/검색 0건 단위 테스트와 `.env.local` 없이 `curl`로 JSON 응답이 오는 것을 확인

## 4. 통합 확인

- [ ] 4.1 `curl`로 인덱싱 → 질문 → 답변+sources → 후속 질문(히스토리 반영) 흐름을 API 수준에서 end-to-end로 확인하고 `npm run lint`, `npm run build`가 통과하는지 확인

## Workflow follow-up

- 화면 구현은 `review-dashboard-ui` 변경에서 진행하며, 이 변경을 먼저 구현한다.
- 구현 완료 후 `/opsx:archive`로 변경을 아카이브한다.
- 단위 작업별로 Conventional Commits(`feat:`, `fix:`, `refactor:`) 형식의 한국어 커밋 메시지로 커밋한다.
