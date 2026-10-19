# Proposal

## Why

Mock RAG의 기본 흐름(CSV 적재 → 검색 → 답변)은 이미 동작하지만, 실제 데이터(`samples/review.csv` 100건)와 4단계(`USE_MOCK=false`, Pinecone + Supabase) 전환을 기준으로 보면 세 가지가 부족하다. 첫째, 검색이 키워드 포함 여부만 보고 `helpful_votes`와 `date`를 쓰지 않으며 점수가 의미 없는 원시값이다. 둘째, 매칭이 없으면 빈 결과를 돌려줘 사용자가 아무 근거도 보지 못한다. 셋째, 대화 기록이 전역 하나뿐이고 API 계약(요청 `message`, 응답에 `mode` 없음)이 4단계에서 UI를 바꾸지 않고 확장하기에 충분하지 않다. 지금 데이터 접근 함수를 분리하고 계약을 확정해, 모드를 바꿔도 라우트와 UI가 그대로이게 한다.

## What Changes

- 데이터 접근 함수를 `src/lib/review-store.ts`로 분리한다: `indexMockReviews()`, `searchMockReviews(query, topK = 5)`, `saveMockMessage()`, `getMockMessages()`. 라우트는 `USE_MOCK` 분기를 한 곳(저장소 팩토리)에서만 거치고, 4단계에서는 같은 모양의 실데이터 함수를 추가하면 된다.
- 리뷰 레코드에 `date`와 `helpful_votes`를 추가로 읽는다.
- 검색 점수를 키워드 포함 횟수(제목 가중)와 `helpful_votes`를 조합해 **0.65 ~ 0.98** 범위로 정규화한다. 결과는 점수 내림차순 상위 5건이다.
- 매칭되는 키워드가 하나도 없으면 빈 결과 대신 `helpful_votes` 상위 5건을 기본 반환한다.
- **BREAKING** `POST /api/index-data` 응답: `{ success, mode, data: { indexed } }` (기존 `data.count`).
- **BREAKING** `POST /api/chat` 요청: `{ query, chatId? }` (기존 `{ message }`). 응답: `{ success, mode, answer, sources }`이고 각 source는 `{ id, title, content, rating, author, date, score }`.
- 대화 히스토리를 `chatId`별로 보관한다. `chatId`를 생략하면 하나의 기본 대화를 공유한다.
- 답변 프롬프트를 전자제품 쇼핑몰 리뷰 분석가 역할로 바꾼다. 리뷰에 없는 사실을 지어내지 않고, 장점과 단점을 균형 있게 설명하며, 작성자의 의견을 인용한다. 컨텍스트는 `[리뷰 N] ★{rating} {title} — {content} (작성자: {author})` 형식이다.
- UI의 [샘플 데이터 인덱싱] 버튼과 채팅 입력창을 새 계약에 맞춰 연결한다(클라이언트가 `chatId`를 만들어 보낸다).
- API 키가 없을 때의 검색 결과 JSON 응답은 유지하되, 새 점수·필드와 기본 반환 규칙을 반영한다.

범위 밖: Pinecone/Supabase 실제 연동(4단계), 인증, 토큰 스트리밍, 한국어 형태소 분석, 카드에 `date`·`score`를 표시하는 UI 변경.

## Capabilities

### New Capabilities
<!-- 새 capability 없음. 기존 Mock RAG 동작의 계약과 검색 규칙을 바꾼다. -->

### Modified Capabilities
- `mock-review-indexing`: 인덱싱 응답을 `{ success, mode, data: { indexed } }`로 바꾸고, 리뷰 레코드에 `date`와 `helpful_votes`를 포함한다.
- `review-rag-chat`: 요청을 `{ query, chatId? }`로 바꾸고 응답에 `mode`를 추가하며, 검색 점수 정규화·`helpful_votes` 반영·매칭 없을 때 인기 리뷰 기본 반환·출처 필드(`date`, `score`)·`chatId`별 히스토리·답변 규칙(균형, 인용)·키 없는 JSON 응답을 갱신한다.

## Impact

- 수정 코드: `src/lib/{types,csv,search,chain,retrieval-json,api-client}.ts`, `src/lib/repository/{index,mock}.ts`, `src/app/api/{index-data,chat}/route.ts`, `src/components/Dashboard.tsx`, 그리고 관련 테스트 전부.
- 신규 코드: `src/lib/review-store.ts`.
- API 계약 변경(**BREAKING**): 요청 키 `message`→`query`, 인덱싱 응답 `data.count`→`data.indexed`, 모든 성공 응답에 `mode` 추가. 클라이언트는 이 저장소의 UI뿐이며 같은 변경 안에서 함께 수정한다. 기존 필드를 병행 지원하지 않는다.
- 의존: `review-dashboard-ui`(진행 중)의 `api-client.ts`, `Dashboard.tsx`, `GET /api/status`와 같은 파일을 만진다. 그 변경의 남은 태스크(시각 확인, 종단 확인)는 이 변경 이후에 진행한다.
- 새 의존성 없음. 임베딩 라이브러리와 `@langchain/pinecone`은 추가하지 않는다(CLAUDE.md 금지 사항).
- 가정: `samples/review.csv`의 컬럼은 `id, rating, title, content, author, date, helpful_votes, verified_purchase`이고 `date`는 문자열 그대로 보관한다. `helpful_votes`가 숫자가 아니면 0으로 본다. `verified_purchase`는 읽지 않는다.
- 가정: 4단계 실데이터 함수의 이름은 Mock과 짝이 되도록 `indexRealReviews`, `searchRealReviews`, `saveRealMessage`, `getRealMessages`로 한다(이번 변경에서는 만들지 않는다).
