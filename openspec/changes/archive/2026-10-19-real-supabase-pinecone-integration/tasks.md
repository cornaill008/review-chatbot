# Tasks

## 1. 사전 확인 (외부 서비스 쓰기 권한과 SDK 호출 형태)

- [x] 1.1 공개 키로 Supabase `reviews`·`messages`에 프로브 행(`id`/`chat_id`가 `__probe__`)을 upsert·insert하고 조회한 뒤 삭제해 쓰기·삭제 권한과 `id` 기준 upsert(`onConflict: 'id'`)가 동작하는지 확인한다. **막혀 있으면(RLS 위반 등) 여기서 구현을 멈추고 사용자에게 선택지(① anon 정책 추가 SQL ② 서버 전용 비밀 키)를 제시한다.** 프로브 행은 반드시 삭제하고 두 테이블이 다시 비어 있는지 확인
- [x] 1.2 Pinecone 임시 네임스페이스(`__probe__`)에 레코드 1건을 `ns.upsertRecords({ records })`로 적재하고 `ns.searchRecords`로 검색(결과의 `_id`·`_score`·`fields` 형태와 반영 지연 시간을 기록)한 뒤 `deleteAll`로 정리해 호출 형태·`describeIndexStats` 응답 구조(`namespaces.<이름>.recordCount`)·`deleteMany({ ids })` 시그니처를 확인하고 `reviews` 네임스페이스는 건드리지 않았는지 확인

## 2. 설정·오류 기반

- [x] 2.1 `src/lib/errors.ts`(`ConfigError`, `RealStoreError`, 비밀 값을 가리는 `describeError`)를 만들고 `/api/chat`의 로컬 `describeError`를 이쪽으로 옮겨, Pinecone·Supabase·Kimi 키가 메시지에 섞여도 가려지는지와 이름·HTTP 상태·메시지만 남는지 단위 테스트가 통과하는지 확인
- [x] 2.2 `src/lib/clients.ts`(필수 설정 검증, Supabase 키 참조 순서 `PUBLISHABLE_DEFAULT_KEY ?? PUBLISHABLE_KEY ?? ANON_KEY`, Pinecone 호스트 생략·예시 값(`xxxx`) 처리, 네임스페이스 `reviews`, `globalThis` 지연 생성)를 구현하고, 변수 누락 시 이름만 담은 `ConfigError`·키 우선순위·공백 값·호스트 처리·재사용 단위 테스트가 통과하는지 확인

## 3. 데이터 모델 정리

- [x] 3.1 `csv.ts`·`types.ts`에 `verifiedPurchase`(`true` 대소문자 무시만 참)와 `ChatMessage.sources`를 추가하고, `normalizeChatId`/`DEFAULT_CHAT_ID`를 `src/lib/chat-id.ts`로 옮겨 Mock이 이를 쓰게 하며, `search.ts`의 점수 변환을 `toDisplayScore`로 공개해 `verified_purchase` 변환·누락과 기존 Mock 테스트 전부(202개)가 그대로 통과하는지 확인

## 4. 실데이터 저장소: 인덱싱

- [x] 4.1 `src/lib/review-store-real.ts`의 `indexRealReviews`를 구현하고(Supabase에서 stale id 계산 → CSV 행 upsert → stale 삭제 → Pinecone stale `deleteMany` → 96개 이하 순차 `upsertRecords` → 반영 대기 폴링), SDK를 모킹한 테스트로 레코드 필드(`_id, text, rating, author, title, content`, 벡터 없음)·`upsertRecords({ records })` 형태·96/4건 배치와 순차 호출·Supabase 행 매핑(정수 평점, `verified_purchase`)·`onConflict: 'id'`·stale 삭제 양쪽·같은 CSV 재실행 시 중복 없음·반영 대기 성공/시간 초과(가짜 타이머)·각 단계 실패 시 `RealStoreError`와 이후 단계 미실행이 통과하는지 확인

## 5. 실데이터 저장소: 검색·대화·상태

- [x] 5.1 `searchRealReviews`를 구현하고(`searchRecords({ query: { topK: 5, inputs: { text } }, fields })`, `hits`의 `_id`·`_score`·`fields`로 source 구성, Supabase에서 `date` 보강·실패 시 `''`, `toDisplayScore` 적용, Pinecone 순위 유지), 인수 형태·점수 매핑(0.5→0.82, 1.3→0.98, -0.2→0.65)·작성일 보강과 실패 폴백·결과 없음 케이스 테스트가 통과하는지 확인
- [x] 5.2 `saveRealMessage`/`getRealMessages`를 구현하고(`messages` insert, `chat_id` 기본값 `default`, 어시스턴트의 `sources`, 최근 N건을 `created_at` 내림차순으로 읽어 시간순으로 반환), `isRealIndexed`/`countRealReviews`(Supabase 건수 + Pinecone 레코드 수, 한쪽만 있으면 `indexed: false`)와 함께 가짜 Supabase를 쓴 테스트로 순서·`chat_id` 분리·`limit`·상태 3케이스(전/후/한쪽만)가 통과하는지 확인
- [x] 5.3 `repository/real.ts` 어댑터와 팩토리를 연결해 `USE_MOCK === 'false'`일 때만 실데이터 저장소를 돌려주고(그 외는 기존 Mock, "구현되지 않았습니다" 오류 제거), 모드별 인스턴스 선택과 Mock 경로가 Pinecone·Supabase를 건드리지 않는 것을 테스트로 확인

## 6. 라우트

- [x] 6.1 세 라우트가 `ConfigError`는 변수 이름만 담은 메시지로, `CsvError`는 기존 그대로, 그 밖의 오류는 일반화된 문구로 응답하도록 고치고(현재 `/api/index-data`·`/api/status`가 `error.message`를 그대로 내보내는 것 제거), `/api/chat`이 어시스턴트 메시지에 `sources`를 함께 저장하게 하며, 가짜 저장소를 쓴 라우트 테스트(실데이터 모드 성공 응답의 `mode: 'real'`, 설정 누락, Pinecone·Supabase 실패 시 일반화된 응답·대화 미저장, 비밀 값 비노출, Mock 모드 응답 불변)가 통과하는지 확인

## 7. 문서

- [x] 7.1 `CLAUDE.md`의 Supabase 키 참조 순서와 환경변수 목록(`PINECONE_HOST` 선택, 키 이름 3종)을 갱신하고, 금지 사항 3번 아래에 SDK 9.x 호출 형태(`upsertRecords({ records })`, `searchRecords({ query: { topK, inputs: { text } }, fields })`)를 덧붙이며, 문서에 키 값이 없는지 `grep`으로 확인

## 8. 실제 서비스 검증

- [x] 8.1 별도 포트의 테스트 서버를 `USE_MOCK=false` 환경변수로 띄워(`.env.local`은 변경하지 않음) 인덱싱을 실행해 `indexed: 100`, Supabase `reviews` 100행, Pinecone `reviews` 100레코드가 되고 응답 시간을 기록하며, 다시 실행해도 100건 그대로(중복 없음)인지 확인
- [x] 8.2 같은 서버에서 `/api/status`가 `mode: 'real'`, `indexed: true`, `count: 100`을 돌려주고, "배터리는 얼마나 가요?" 검색 결과 상위 리뷰가 실제로 배터리 관련인지(`sources` 5건, `score` 0.65~0.98, `date` 채워짐), 키 없음 폴백(JSON)과 Kimi 답변 두 경우 모두 동작하는지 확인
- [x] 8.3 대화가 Supabase `messages`에 `user`/`assistant` 행(어시스턴트의 `sources` 포함)으로 저장되는지 조회로 확인하고, 서버를 재시작한 뒤 같은 `chatId`로 후속 질문을 해 이전 대화가 반영되는지, 다른 `chatId`와 분리되는지 확인
- [x] 8.4 서버 로그와 응답에 Pinecone·Supabase·Kimi 키 값이 없는지 전수 검사하고(잘못된 Pinecone 키로 띄운 서버의 인증 실패 포함), 잘못된 키·설정 누락 시 응답이 일반화된 문구/변수 이름뿐인지 확인하며, 코드에 `PineconeStore`·`@langchain/pinecone`·`Embeddings` import가 없는지 `grep`으로 확인

## 9. 통합 확인

- [x] 9.1 `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`가 모두 통과하고 Mock 모드의 기존 동작(테스트 202개)이 변하지 않았는지 확인
- [x] 9.2 실제 Chrome에서 `USE_MOCK=false` 테스트 서버로 배지가 "실데이터 모드"로 보이고 [샘플 데이터 인덱싱] → 질문 → 답변·카드 → 후속 질문이 동작하며 인덱싱 중 스피너와 완료 상태가 정상인지 스크린샷으로 확인

## Workflow follow-up

- 구현 후 `/opsx:archive`로 아카이브하면 새 main 스펙 `real-data-mode`가 생기고 `review-rag-chat`(수정 3)과 `mock-review-indexing`(수정 1)이 갱신된다. 먼저 완료된 `kimi-llm-integration`을 아카이브해도 충돌하지 않는다(수정하는 요구사항이 겹치지 않음).
- `.env.local`의 `USE_MOCK=false` 전환은 검증이 끝난 뒤 사용자가 결정한다(이 변경은 `.env.local`을 바꾸지 않는다).
- 단위 작업별로 Conventional Commits 형식의 한국어 커밋 메시지로 커밋한다(커밋 시점은 사용자가 정한다).
