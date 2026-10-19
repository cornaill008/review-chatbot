# Proposal

## Why

지금은 `USE_MOCK=false`로 바꾸면 `/api/*`가 "구현되지 않았습니다" 오류만 낸다. 앱의 마지막 단계(4단계)는 리뷰를 실제 Pinecone 통합 임베딩 인덱스로 검색하고, 리뷰 원본과 대화 기록을 Supabase에 영속화하는 실데이터 모드다. 이렇게 하면 서버를 재시작해도 데이터와 대화가 남고, 키워드 매칭 대신 의미 기반 검색을 쓸 수 있다. Mock 모드(`USE_MOCK`이 `'false'`가 아닌 모든 경우)의 동작은 바꾸지 않는다.

## What Changes

- `USE_MOCK === 'false'`일 때 저장소를 Pinecone + Supabase 구현으로 바꾼다. 라우트와 UI는 그대로이고 저장소 팩토리(`getRepository()`)에서만 분기한다.
- **인덱싱(`POST /api/index-data`)**: `samples/review.csv`를 Supabase `reviews`에 `id` 기준으로 upsert하고, Pinecone 네임스페이스 `reviews`에 `{ _id, text, rating, author, title, content }` 레코드를 96개 이하씩 순차로 `upsertRecords`한다. 응답은 기존 규격(`{ success, mode: 'real', data: { indexed } }`)이다.
- **검색(`POST /api/chat`)**: Pinecone `searchRecords`(`topK: 5`, 텍스트 입력)로 상위 5건을 찾는다. 작성일은 Supabase에서 가져오고, 점수는 Pinecone의 `_score`를 기존과 같은 0.65~0.98 범위로 매핑해 `sources`를 만든다. 답변 생성(Kimi 체인)은 그대로다.
- **대화 기록**: 질문과 답변을 Supabase `messages`에 `chat_id`별로 저장하고(답변에는 `sources`도), 후속 질문의 문맥은 같은 `chat_id`의 최근 메시지에서 읽는다.
- **상태(`GET /api/status`)**: `mode: 'real'`과 Supabase·Pinecone 기준의 `indexed`, `count`를 돌려준다.
- 설정과 오류 처리: 필수 환경변수가 없으면 변수 이름만 안내하는 오류를 내고, Pinecone·Supabase 오류는 일반화된 문구만 응답하며 키 값은 응답과 로그에 남기지 않는다. `PINECONE_HOST`는 선택이다(없거나 예시 값이면 SDK가 인덱스 이름으로 찾는다).
- Supabase 공개 키는 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? NEXT_PUBLIC_SUPABASE_ANON_KEY` 순으로 참조한다(요청서의 두 단계에 현재 `.env.local`이 쓰는 이름을 중간에 추가).
- 스펙 정리: Mock 전용으로 쓰여 있던 요구사항(키워드 검색, 인기 리뷰 기본 반환, 인메모리 히스토리)의 적용 범위를 명시하고, 리뷰 레코드에 `verified_purchase`를 추가한다.
- `CLAUDE.md`를 갱신한다(Supabase 키 참조 순서, SDK 9.x 호출 형태).

범위 밖: 인증과 사용자별 권한, RLS 정책 설계, 배포(Vercel)와 함수 실행 시간 제한 대응, 대화 기록 삭제·보존 기간, 검색 결과 재순위화(rerank), UI 변경.

## Capabilities

### New Capabilities
- `real-data-mode`: `USE_MOCK=false`에서 Pinecone 통합 임베딩 검색과 Supabase 저장을 쓰는 인덱싱·검색·대화 기록·상태 조회와 오류 처리.

### Modified Capabilities
- `review-rag-chat`: "상위 5건 리뷰 검색"과 "매칭 없을 때 인기 리뷰 기본 반환"을 Mock Mode 전용으로 한정하고, "대화 히스토리 저장"에 실데이터 모드의 저장 위치를 추가한다.
- `mock-review-indexing`: "리뷰 레코드 필드"에 `verifiedPurchase`(구매 인증)를 추가한다.

## Impact

- 신규 코드: `src/lib/clients.ts`(Pinecone·Supabase 클라이언트와 설정 검증), `src/lib/review-store-real.ts`(`indexRealReviews`, `searchRealReviews`, `saveRealMessage`, `getRealMessages`, `isRealIndexed`, `countRealReviews`), `src/lib/repository/real.ts`(어댑터), `src/lib/errors.ts`(로그용 오류 설명과 비밀 가림).
- 수정 코드: `repository/index.ts`(팩토리), `csv.ts`·`types.ts`(`verifiedPurchase`, `ChatMessage.sources`), `search.ts`(점수 매핑 함수 공개), 세 라우트의 오류 처리, 관련 테스트.
- 의존성: 이미 설치된 `@pinecone-database/pinecone`(9.0.0)과 `@supabase/supabase-js`(2.118)를 쓴다. `@langchain/pinecone`(`PineconeStore`)과 임베딩 클래스는 쓰지 않는다(CLAUDE.md 금지 사항).
- 외부 서비스: 리뷰 100건의 제목·내용이 Pinecone(임베딩 추론)과 Supabase에 저장되고, 질문 텍스트가 Pinecone으로 전송된다. 대화 내용은 Supabase에 쌓인다.
- 문서: `CLAUDE.md`.
- 확인된 사실(키로 읽기 전용 조회): Pinecone 인덱스 `review-chatbot`은 통합 임베딩(`llama-text-embed-v2`, 1024차원, cosine, `text`→`text`)이고 비어 있다. 실제 호스트는 `review-chatbot-ruz2jxo.svc.aped-4627-b74a.pinecone.io`다. Supabase에는 `reviews`(`id text`, `rating int`, `title`, `content`, `author`, `date text`, `helpful_votes int`, `verified_purchase boolean`, `created_at timestamptz`)와 `messages`(`id uuid`, `chat_id text`, `role text`, `content text`, `created_at timestamptz`, `sources json`)가 있고 공개 키로 읽을 수 있으며 둘 다 비어 있다. 컬럼 이름·타입은 쿼리 오류 메시지로 추정한 값이다.
- 확인되지 않은 것(위험): 공개 키로 쓰기(insert/upsert/delete)가 가능한지는 데이터를 쓰지 않고는 알 수 없어 구현 첫 단계에서 확인한다. RLS가 쓰기를 막고 있으면 구현을 멈추고 방향(정책 추가 vs 서버 전용 비밀 키)을 사용자에게 묻는다.
- 가정: 요청서의 2번(`/api/chat`)이 중간에서 끊겨 있어 이후(컨텍스트 생성, 체인, 응답 형식, 대화 저장)는 기존 Mock 경로와 같게 하고 저장소만 바꾼다. `sources`의 `date`는 Pinecone 레코드(CLAUDE.md의 레코드 형태 `{ _id, text, rating, author, title, content }`)에 없으므로 Supabase `reviews`에서 가져온다.
- 가정: 요청서의 `ns.upsertRecords(records)`는 SDK 9.0.0에서 동작하지 않는다(`options.records is not iterable`로 실패하는 것을 확인). 올바른 형태는 `ns.upsertRecords({ records })`다.
