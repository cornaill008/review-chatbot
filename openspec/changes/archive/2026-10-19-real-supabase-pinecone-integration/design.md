# Design

## Context

동기와 범위는 proposal.md, 요구사항은 `specs/`를 따른다. 현재 상태:

- 저장소 추상화(`ReviewRepository`: `index`, `search`, `isIndexed`, `count`, `appendMessage`, `getHistory`)와 `getRepository()` 팩토리가 있다. `USE_MOCK === 'false'`면 팩토리가 "구현되지 않았습니다" 오류를 던진다. Mock 구현은 `review-store.ts`의 `globalThis` 저장소를 쓴다. 라우트는 `getRepository()`만 알고, 검색 결과 변환·답변 생성(`generateAnswer`)·키 없음 폴백은 모드와 무관하다.
- 설치된 SDK: `@pinecone-database/pinecone` 9.0.0, `@supabase/supabase-js` 2.118.0.
- 키로 읽기 전용 조회해 확인한 사실:
  - Pinecone `review-chatbot`: 서버리스(aws us-east-1), 통합 임베딩(`llama-text-embed-v2`, 1024차원, cosine, `fieldMap: { text: 'text' }`, 쓰기 `input_type: passage`, 읽기 `query`), 레코드 0개. 호스트는 `review-chatbot-ruz2jxo.svc.aped-4627-b74a.pinecone.io`이며 `pc.index(name)`(호스트 생략)과 `pc.index(name, host)` 둘 다 동작했다. `.env.local`의 `PINECONE_HOST`는 예시 값(`xxxx`)이다.
  - SDK 9.0.0의 네임스페이스 객체 메서드: `upsertRecords`, `searchRecords`, `deleteMany`, `deleteAll`, `describeIndexStats`, `fetch`, `listPaginated`. `upsertRecords`는 `{ records, namespace? }` 객체를 받는다. 배열을 직접 넘기면 `options.records is not iterable`로 실패한다(요청서의 `ns.upsertRecords(records)` 형태는 그대로 쓸 수 없다). `searchRecords({ query: { topK, inputs }, fields })`는 요청서와 같은 형태가 맞다.
  - Supabase: `reviews`(`id text`, `rating int`, `title text`, `content text`, `author text`, `date text`, `helpful_votes int`, `verified_purchase boolean`, `created_at timestamptz`)와 `messages`(`id uuid`, `chat_id text`, `role text`, `content text`, `created_at timestamptz`, `sources json`)가 있고 공개 키로 읽을 수 있으며 둘 다 비어 있다. 컬럼은 쿼리 오류로 추정한 것이라 기본값·NOT NULL·기본 키·인덱스는 모른다. 쓰기 권한(RLS)도 모른다.
- CLAUDE.md: Pinecone은 `upsertRecords`/`searchRecords` 직접 호출, `PineconeStore`·임베딩 라이브러리 금지, 적재 레코드 `{ _id, text, rating, author, title, content }`, 환경변수는 `process.env.*`로만 참조.

## Goals / Non-Goals

**Goals:**
- `USE_MOCK=false`에서 라우트와 UI 변경 없이 같은 API 규격으로 Pinecone 검색 + Supabase 저장이 동작한다.
- Mock 모드는 한 줄도 동작이 바뀌지 않는다.
- 외부 서비스 장애·설정 누락이 서버 오류나 비밀 값 노출로 번지지 않는다.

**Non-Goals:**
- 인증·RLS 정책 설계, 배포 환경의 함수 실행 시간 제한 대응, 대화 보존 기간, 재순위화, UI 변경.

## Decisions

### 1. 모드 분기는 저장소 팩토리 한 곳, 구현은 `review-store-real.ts`
`getRepository()`가 `USE_MOCK === 'false'`면 `RealReviewRepository`, 아니면 기존 Mock을 돌려준다. 환경변수는 호출 때마다 읽어(테스트에서 바꿀 수 있게) 모드별 인스턴스를 따로 캐시한다. `review-store-real.ts`에 Mock과 짝이 되는 함수 `indexRealReviews`, `searchRealReviews`, `saveRealMessage`, `getRealMessages`, `isRealIndexed`, `countRealReviews`를 두고 `repository/real.ts`는 얇은 어댑터다. "구현되지 않았습니다" 오류는 사라진다.

### 2. 클라이언트와 설정 (`src/lib/clients.ts`)
- 설정 검증 `readRealConfig()`는 필수 변수(`PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `NEXT_PUBLIC_SUPABASE_URL`, Supabase 공개 키)가 비면 빠진 이름 목록으로 `ConfigError`를 던진다. 메시지에는 이름만 쓴다.
- Supabase 키: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? NEXT_PUBLIC_SUPABASE_ANON_KEY` 중 비어 있지 않은 첫 값(각 값은 `trim`). 요청서의 두 단계에 현재 `.env.local`의 이름을 중간에 넣었고 CLAUDE.md를 같은 순서로 맞춘다. 서버(라우트 핸들러)에서만 쓰므로 브라우저 번들에는 들어가지 않는다.
- Pinecone: `new Pinecone({ apiKey })`, `pc.index(name, host)` 또는 호스트가 없거나 예시 값(`/xxxx/i`)이면 `pc.index(name)`로 만들고 `.namespace('reviews')`를 쓴다. `PINECONE_HOST`를 선택으로 둔 이유는 현재 `.env.local`이 예시 값이어도 수정 없이 동작하게 하고, 호스트는 SDK가 인덱스 이름으로 찾을 수 있기 때문이다(확인함).
- Supabase: `createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })`. 서버 전용이라 세션을 저장하지 않는다.
- 두 클라이언트는 `globalThis`에 지연 생성해 개발 모드(HMR)에서도 재사용한다. 설정이 바뀌면(테스트) 키 조합이 달라진 경우 새로 만든다.

### 3. Pinecone 호출 형태 (SDK 9.0.0 기준, CLAUDE.md 준수)
- 적재: `await ns.upsertRecords({ records })` — 레코드는 `{ _id, text: `${title} ${content}`, rating: Number(rating), author, title, content }`. 임베딩 벡터는 클라이언트에서 만들지 않는다(통합 임베딩). 한 번에 96개 이하로 나눠 **순차**로 보낸다(병렬 호출은 추론 속도 제한을 건드릴 수 있어 쓰지 않는다).
- 검색: `await ns.searchRecords({ query: { topK: 5, inputs: { text: query } }, fields: ['title', 'content', 'rating', 'author'] })` → `res.result.hits[]`의 `_id`, `_score`, `fields`.
- 삭제·통계: `ns.deleteMany({ ids })`, `ns.describeIndexStats()`(`namespaces.reviews.recordCount`).
- `PineconeStore`, `@langchain/pinecone`, 임베딩 클래스는 쓰지 않는다. 구현 후 `grep`으로 확인한다.

### 4. 인덱싱 순서와 멱등성
1. `loadReviews()`(CSV, 기존 `CsvError` 처리 그대로).
2. **Supabase 먼저**(원본 저장소): 현재 `reviews`의 id 목록을 읽어 CSV에 없는 id(stale)를 구하고, CSV 행을 `id` 기준으로 upsert(`onConflict: 'id'`, 한 번에 500행 이하)한 뒤 stale을 삭제한다. 행 매핑: `id, rating(정수로 반올림), title, content, author, date, helpful_votes, verified_purchase`. `created_at`은 DB 기본값에 맡긴다.
3. **Pinecone**: stale id를 `deleteMany`(1000개 이하씩)로 지우고 레코드를 96개 이하씩 순차 `upsertRecords`.
4. **반영 대기**: Pinecone은 적재 직후 검색·통계에 바로 보이지 않을 수 있어 `describeIndexStats()`를 1초 간격으로 최대 30초 폴링해 `reviews` 네임스페이스의 레코드 수가 CSV 행 수 이상이 될 때까지 기다린다. 시간 안에 못 채워도 적재가 성공했으면 성공으로 응답한다(대화 중 곧 반영됨).
5. 응답 `indexed`는 CSV 유효 행 수.
- 같은 `id`를 같은 값으로 다시 쓰므로 반복 실행해도 같은 상태가 된다(멱등). 단계 사이에 실패하면 되돌리지 않고 실패를 응답한다. `isRealIndexed()`가 Supabase와 Pinecone 양쪽을 확인하므로 한쪽만 적재된 상태는 `indexed: false`로 보이고, 같은 CSV로 다시 실행하면 복구된다.
- 대안: Pinecone을 먼저 쓰기 → 원본(Supabase)이 없는 벡터가 생길 수 있어 기각. 트랜잭션형 롤백 → 두 외부 시스템 사이에 분산 트랜잭션이 없어 과하다.

### 5. 검색: Pinecone 필드 + Supabase 작성일
CLAUDE.md의 적재 레코드 형태에는 `date`가 없고 응답 source에는 `date`가 필요하다. Pinecone 레코드에 `date`를 추가하는 대신(레코드 형태 규칙 유지), 검색 결과의 id 목록으로 Supabase `reviews`에서 `id, date`를 한 번에 조회해 채운다(`in('id', ids)`). 이 조회가 실패해도 작성일은 부가 정보라 `''`로 두고 답변 생성은 계속한다(실패는 로그에 남긴다). 제목·내용·평점·작성자는 Pinecone `fields`를 쓴다. 결과 순서는 Pinecone 순위 그대로다.
- 대안: Supabase에서 전체 행을 다시 읽기 → Pinecone에 이미 있는 값을 중복 조회해 불필요하다. `date`를 Pinecone 필드로 추가 → CLAUDE.md의 레코드 형태에서 벗어난다.

### 6. 점수 매핑
Pinecone `_score`(cosine 유사도)는 Mock의 정규화 점수와 범위가 다르다. UI와 스펙이 쓰는 0.65~0.98 범위를 지키려고 Mock과 같은 식 `0.65 + 0.33 × clamp(_score, 0, 1)`을 쓴다(소수 둘째 자리 반올림). `search.ts`의 비공개 `toScore`를 공개 이름(`toDisplayScore`)으로 내보내 재사용한다. 단조 증가라 Pinecone 순위가 그대로 유지된다. 값은 표시용이며 실제 유사도가 아니라는 UI의 기존 설명과 같다.

### 7. 대화 기록 (`messages`)
- 저장: 답변 생성 성공 후 `insert`로 `user` 행과 `assistant` 행을 순서대로 넣는다(`chat_id`, `role`, `content`, 어시스턴트에는 `sources`). 두 행은 순차 요청이라 `created_at`(DB 기본값) 순서가 보장되며, 같은 시각이 되는 경우를 피하려고 한 번의 `insert([user, assistant])`가 아니라 두 번 호출한다.
- 조회: `chat_id`로 필터해 `created_at` 내림차순 6건을 읽고 뒤집어 시간순으로 돌려준다.
- `chat_id`가 없으면 `default`. 공백 정리 규칙을 Mock과 같게 하려고 `normalizeChatId`/`DEFAULT_CHAT_ID`를 `src/lib/chat-id.ts`로 옮겨 양쪽이 공유한다.
- `ChatMessage`에 선택 필드 `sources?: SourceReview[]`를 추가하고 라우트가 어시스턴트 메시지를 저장할 때 근거를 함께 넘긴다. Mock은 이 필드를 무시해도 된다.
- 키 없음 폴백(검색 결과 JSON)도 대화로 저장한다(Mock과 동일).

### 8. 상태 조회
`count`는 Supabase `reviews` 행 수(`select('id', { count: 'exact', head: true })`), `indexed`는 `count > 0` 그리고 Pinecone 네임스페이스 레코드 수 > 0이다. 상태 API는 두 값을 병렬로 읽는다.

### 9. 오류 처리와 비밀 보호 (`src/lib/errors.ts`)
- `ConfigError`(빠진 변수 이름 목록)와 `describeError(error)`(이름·HTTP 상태·메시지만, 알려진 비밀 값 — Pinecone 키, Supabase 키들, Kimi 키 — 을 `[이름]`으로 가림)를 공유한다. 기존 `/api/chat`의 로컬 `describeError`를 이쪽으로 옮긴다.
- Supabase는 오류를 던지지 않고 `{ error }`로 돌려주므로 저장소 계층이 이를 `RealStoreError`(안전한 요약 문구 + 원인)로 바꿔 던진다.
- 라우트: `ConfigError`는 그 메시지(변수 이름만)를 응답하고, `CsvError`는 기존 그대로, 그 밖의 오류는 일반화된 문구만 응답한다. 현재 `/api/index-data`와 `/api/status`는 임의의 `error.message`를 그대로 응답하는데, 외부 서비스 오류 본문이 새어 나갈 수 있어 일반화된 문구로 바꾼다(Mock 모드에서도 CSV 오류 외에는 같은 처리).

### 10. 쓰기 권한(RLS) 위험과 구현 첫 단계의 확인
공개 키로 쓰기가 되는지는 데이터를 쓰지 않고는 알 수 없다. 구현 첫 단계에서 프로브 행(`id: '__probe__'`, `chat_id: '__probe__'`)을 넣고 지운다. 막혀 있으면(RLS 위반 등) **구현을 멈추고 사용자에게 선택지를 제시**한다: ① `reviews`/`messages`에 익명(anon) insert·update·delete·select 정책을 추가하는 SQL을 안내(공개 키를 아는 누구나 쓸 수 있게 되는 보안 약화를 명시), ② 서버 전용 비밀 키(`SUPABASE_SECRET_KEY`)를 쓰도록 변경(요청서의 공개 키 제약에서 벗어남). 어느 쪽이든 사용자가 정한다. 비밀 키는 `NEXT_PUBLIC_` 접두사를 붙이면 브라우저에 노출되므로 붙이지 않는다.

### 11. 테스트 전략
- Pinecone·Supabase SDK를 모킹한 단위 테스트: 호출 형태(`upsertRecords({ records })`, 96개 배치와 순차성, 레코드 필드, `searchRecords` 인수, `deleteMany`), stale 삭제, 반영 대기 폴링(가짜 타이머), Supabase 행 매핑·upsert 옵션, 작성일 보강과 실패 시 폴백, 점수 매핑, 메시지 저장·조회 순서, 설정 검증, 비밀 가림.
- 테스트용 인메모리 가짜 Supabase(체인 메서드 일부)를 두어 라우트 수준 흐름을 검증한다.
- Mock 회귀: 기존 테스트 전부 그대로 통과해야 한다.
- 실제 서비스 검증: 별도 포트의 테스트 서버를 `USE_MOCK=false` 환경변수로 띄워 검증한다(`.env.local`의 `USE_MOCK`은 건드리지 않고 전환은 사용자가 결정).

## Risks / Trade-offs

- [**공개 키로 쓰기가 막혀 있을 수 있음** — RLS 때문에 구현이 막힘] → 구현 첫 태스크에서 확인하고, 막히면 멈춘 뒤 정책 추가 vs 서버 전용 비밀 키를 사용자에게 묻는다. 공개 키에 쓰기를 열면 누구나 쓸 수 있다는 보안 영향을 알린다.
- [Pinecone 적재 직후 검색이 비어 있을 수 있음(최종 일관성)] → 반영 대기 폴링(최대 30초). 시간 초과 시에도 성공으로 응답하므로 직후 첫 질문이 일부만 검색될 수 있다.
- [인덱싱이 느림: 임베딩 추론 + 폴링으로 수 초~30초] → UI에 이미 스피너가 있다. 배포 환경(Vercel)의 함수 시간 제한은 범위 밖이며 배포 단계에서 다룬다.
- [두 저장소 사이에 트랜잭션이 없어 부분 실패 가능] → Supabase 먼저, 멱등 재실행으로 복구, 상태 API가 양쪽을 확인해 불일치를 `indexed: false`로 드러낸다.
- [컬럼 이름·타입이 오류 메시지로 추정한 값(기본값·NOT NULL·기본 키 미확인)] → 프로브 단계에서 upsert(`onConflict: 'id'`)가 실제로 동작하는지 확인한다. `id`에 고유 제약이 없으면 upsert가 실패하므로 그때 사용자에게 알린다.
- [`rating`이 DB에서 정수인데 CSV에 소수가 있을 수 있음] → Supabase 행에는 반올림한 정수를, Pinecone 메타데이터에는 원래 숫자를 쓴다.
- [대화 기록과 리뷰 텍스트가 외부에 저장됨(Supabase)·전송됨(Pinecone 추론)] → 지금은 공개 샘플 데이터다. 실제 사용자 대화가 쌓이므로 보존 기간·삭제 방안은 후속 변경에서 다룬다.
- [`messages`가 무한히 쌓임] → 문맥으로는 최근 6건만 읽어 영향이 작다. 정리는 범위 밖.
- [키 노출] → 오류 로그에서 알려진 비밀 값을 가리고, 테스트는 가짜 값만 쓴다. 이 대화에 노출된 Pinecone·Kimi 키는 재발급을 권한다.
- [Mock 모드 회귀] → Mock 경로 코드는 건드리지 않고(`review-store.ts`) 공용 함수만 이동·공개한다. 기존 202개 테스트가 그대로 통과해야 한다.

## Open Questions

- (결정 필요, 구현 중 확인) 공개 키의 쓰기 권한과 RLS. 막혀 있을 때의 방향은 사용자가 정한다(결정 10).
- (후속) 대화 기록 보존·삭제 정책, 검색 재순위화.
