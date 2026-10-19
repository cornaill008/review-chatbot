# Design

## Context

동기와 범위는 proposal.md, 요구사항은 `specs/`를 따른다. 기준이 되는 현재 상태:

- main 스펙 `mock-review-indexing`, `review-rag-chat`이 archive된 `2026-10-19-dashboard-ui-and-mock-rag` 변경에서 만들어졌고, 구현도 되어 있다. 이 변경은 그 계약을 바꾼다.
- 데이터 접근은 `src/lib/repository/`의 `ReviewRepository`(`index`, `search`, `isIndexed`, `count`, `appendMessage`, `getHistory`)와 `getRepository()` 팩토리를 거친다. Mock 구현은 `repository/mock.ts`가 `globalThis` 스토어를 직접 들고 있고, CSV 파싱은 `csv.ts`, 검색은 `search.ts`에 있다.
- 현재 검색 점수는 토큰이 제목(+2)·내용(+1)에 포함되는지의 합이며 `helpful_votes`와 `date`를 읽지 않는다. 매칭이 없으면 빈 결과다.
- 대화 히스토리는 전역 배열 하나다. `/api/chat` 요청은 `{ message }`, 인덱싱 응답은 `{ data: { count } }`이다.
- `samples/review.csv`는 100행, 컬럼은 `id, rating, title, content, author, date, helpful_votes, verified_purchase`이다.
- CLAUDE.md: Mock-First, UI는 모드를 몰라야 함, 모델 ID `claude-haiku-4-5`, 임베딩 라이브러리·`PineconeStore` 금지, 4단계 적재는 `namespace.upsertRecords()`, 검색은 `namespace.searchRecords()`. Next.js 16의 `cacheComponents`가 켜져 있어 route segment config는 쓰지 않는다.

## Goals / Non-Goals

**Goals:**
- Mock 모드에서 `helpful_votes`·`date`를 반영한 점수 0.65~0.98 검색과 인기 리뷰 기본 반환이 동작한다.
- 4단계에서 `USE_MOCK=false`로 바꿀 때 라우트와 UI는 그대로이고, 같은 모양의 실데이터 함수와 어댑터만 추가하면 된다.
- 새 계약(`query`/`chatId`, `mode`, `indexed`)으로 UI까지 끝에서 끝으로 연결된다.

**Non-Goals:**
- 실데이터 구현(Pinecone/Supabase), 형태소 분석, 스트리밍, 인증, 카드에 `date`·`score` 표시.

## Decisions

### 1. `review-store.ts`는 Mock 데이터 접근 함수 모음, `USE_MOCK` 분기는 한 곳
`src/lib/review-store.ts`가 `indexMockReviews()`, `searchMockReviews(query, topK = 5)`, `saveMockMessage(chatId, message)`, `getMockMessages(chatId, limit?)`와 어댑터용 `isMockIndexed()`, `countMockReviews()`를 export하고, `globalThis` 스토어를 이 파일이 소유한다. `repository/mock.ts`는 이 함수들을 부르는 얇은 어댑터가 된다. 라우트는 계속 `getRepository()`만 알고, `USE_MOCK !== 'false'` 판별은 `repository/index.ts` 한 곳에 둔다.
- 4단계: `review-store-real.ts`에 짝이 되는 `indexRealReviews`, `searchRealReviews`, `saveRealMessage`, `getRealMessages`를 만들고 `RealReviewRepository` 어댑터를 팩토리에 연결한다. 적재는 `upsertRecords()`, 검색은 `searchRecords()`를 쓴다(CLAUDE.md).
- `csv.ts`(파싱)와 `search.ts`(토큰화·점수)는 순수 함수로 남겨 `review-store.ts`가 조합한다. 요청서의 "`fs.readFile` + `papaparse`(header: true)로 읽는다"는 이미 `csv.ts`의 `loadReviews()`가 하는 일이라 옮기지 않고 재사용한다.
- 대안: 라우트에서 `if (USE_MOCK)`로 직접 함수 선택 → 분기가 라우트마다 퍼져 기각.

### 2. 점수 계산과 0.65~0.98 정규화
1. 질문을 토큰화한다(소문자, 공백·문장부호 분리, 2글자 이상, 중복 제거). 3글자 이상 토큰은 끝 한 글자를 뗀 형태도 허용해 조사 변화를 흡수한다(기존 동작 유지).
2. 리뷰별 **관련도** `r` = 매칭된 (토큰, 필드) 쌍의 가중 합. 제목 매칭 2, 내용 매칭 1. 같은 토큰이 같은 필드에 여러 번 나와도 한 번으로 센다(요청서의 "포함된 횟수"는 키워드별 포함 여부의 합으로 해석).
3. `r > 0`인 리뷰들 사이에서 `r_norm = r / max(r)`, 전체 인덱스에서 `v_norm = helpfulVotes / max(helpfulVotes)`(최대가 0이면 0).
4. `combined = 0.8 * r_norm + 0.2 * v_norm` → `score = round2(0.65 + 0.33 * combined)`. 결과는 `combined` 내림차순, 동점은 CSV 순서.
- 관련도가 지배적이고(0.8) 도움이 됨 수는 비슷한 관련도 사이의 순서를 가른다(0.2). 도움이 됨 수만 많은 리뷰가 관련도 높은 리뷰를 앞지르지 못한다.
- `score`는 의미적 유사도가 아니라 표시용 정규화 값이다. 코사인 유사도가 아님을 코드 주석과 이 문서에 남기고, 4단계에서는 `searchRecords()`의 `_score`로 대체된다(범위가 다르면 같은 구간으로 다시 매핑).
- 대안: 점수를 원시 합으로 노출 → 값의 범위가 질문마다 달라 UI·테스트에서 다루기 어려워 기각.

### 3. 매칭이 없을 때 `helpful_votes` 상위 5건
토큰이 없거나 `r > 0`인 리뷰가 하나도 없으면 `helpfulVotes` 내림차순(동점은 CSV 순서) 상위 `topK`건을 반환하고, 점수는 `combined = v_norm`으로 같은 식을 적용한다. 모든 리뷰의 `helpfulVotes`가 0이면 CSV 앞쪽 `topK`건이다.
- 이 때문에 `NO_RESULT_ANSWER`(검색 0건 안내)는 인덱스가 비어 있는 경우에만 도달하며, 비어 있으면 어차피 "인덱싱 필요" 오류가 먼저 나온다. 방어용 가드로만 유지한다.

### 4. `chatId`별 히스토리
`globalThis`의 `Map<string, ChatMessage[]>`에 저장한다. `chatId`가 없으면 키 `"default"`. 메모리 한도로 대화당 최근 200개 메시지, 대화 최대 100개(가장 오래 쓰이지 않은 대화부터 제거)를 둔다. `chatId`는 문자열이어야 하고 공백 제외 100자 이하이며, 아니면 400을 돌려준다. 답변 생성에는 같은 `chatId`의 최근 6개를 쓰고, 성공했을 때만 질문·답변을 함께 저장한다(기존 동작 유지).
- 클라이언트는 첫 전송 시점에 `crypto.randomUUID()`로 `chatId`를 만들어 새로고침 전까지 재사용한다. 렌더 중에 만들지 않는 이유: `cacheComponents`의 프리렌더가 렌더 중 난수 사용을 오류로 다룰 수 있다.
- 대안: 서버가 `chatId`를 발급해 응답에 담기 → 요청서의 계약(`chatId?` 입력)과 달라 기각.

### 5. API 계약 변경과 호환
- `POST /api/index-data` → `{ success: true, mode, data: { indexed } }`.
- `POST /api/chat` ← `{ query, chatId? }`, → `{ success: true, mode, answer, sources }`. `message`는 받지 않는다(병행 지원 없음: 클라이언트가 이 저장소의 UI 하나뿐이고 같은 변경에서 고친다).
- 실패 응답은 기존대로 `{ success: false, error }`이고 `mode`는 넣지 않는다.
- `GET /api/status`의 `data.indexed`(불리언)와 `/api/index-data`의 `data.indexed`(숫자)는 이름이 같고 의미가 다르다. 요청서의 계약을 따르되 타입이 분리되어(`StatusData` / `IndexResult`) 혼동은 컴파일 시점에 잡힌다.
- `mode`는 `repository/index.ts`의 `isMockMode()`에서 읽어 `'mock' | 'real'`로 만든다. UI는 `mode`를 판단에 쓰지 않는다(배지는 계속 `/api/status` 값).

### 6. 프롬프트와 컨텍스트
시스템 프롬프트는 요청서의 문구를 그대로 쓴다: 전자제품 쇼핑몰의 전문 리뷰 분석가, `[실제 구매 고객 리뷰 데이터]`만을 근거로 친절하고 솔직하게 답변, 리뷰에 없는 사실을 추측하지 않음, 장점과 단점이 모두 있으면 균형 있게 설명하고 관련 리뷰 작성자의 의견을 인용. 컨텍스트 한 줄은 `[리뷰 N] ★{rating} {title} — {content} (작성자: {author})`이다. 체인은 `ChatPromptTemplate.fromMessages([...]).pipe(model).pipe(new StringOutputParser())`이며, 이전 대화는 `MessagesPlaceholder`로 메시지 객체를 넘겨 `{}`가 템플릿 변수로 해석되지 않게 한다(기존 방식 유지). 모델은 `new ChatAnthropic({ model: "claude-haiku-4-5", apiKey })`.

### 7. 키 없을 때 JSON 응답 유지
`hasApiKey()`가 거짓이면 `generateAnswer`를 호출하지 않고 검색 결과를 JSON으로 돌려준다. JSON의 `results`에 `date`를 추가하고, 기본 반환 규칙 때문에 결과는 항상 1건 이상이다(인덱스가 비어 있지 않은 한).

### 8. 타입과 UI 연결
- `Review`에 `date: string`, `helpfulVotes: number` 추가. `SourceReview`는 `{ id, title, content, rating, author, date, score }`(점수 필수). 응답 타입에 `mode: DataMode` 추가.
- `api-client.ts`: `runIndexing()`은 `data.indexed`를 읽고, `sendChat(query, chatId)`는 `{ query, chatId }`를 보낸다. `Dashboard.tsx`는 `chatId`를 `useRef<string | null>`로 들고 첫 전송 때 만든다. 화면 동작·문구는 바뀌지 않는다.

## Risks / Trade-offs

- [**BREAKING** 계약 변경으로 서버와 클라이언트가 어긋나면 화면이 깨짐] → 같은 변경 안에서 라우트·`api-client`·`Dashboard`·테스트를 함께 바꾸고, 태스크 말미에 인덱싱→질문 흐름을 `curl`과 컴포넌트 테스트로 확인한다.
- [매칭이 없는데도 인기 리뷰가 "근거"처럼 `0.65` 이상의 점수와 함께 표시되어 오해를 줄 수 있음] → 프롬프트가 근거 부족 시 "리뷰에서 확인되지 않습니다"라고 말하게 하고, 키가 없을 때의 JSON에서도 같은 값을 그대로 보여 준다. 매칭 없음을 구분해 알리는 필드는 요청서 계약에 없어 추가하지 않는다(필요하면 후속 변경).
- [`score`가 실제 유사도가 아님] → 문서화하고 4단계에서 `_score`로 대체. 점수 스케일이 달라질 수 있어 UI는 점수를 해석하지 않는다.
- [인메모리 히스토리 증가] → 대화당 200개·대화 100개 상한.
- [`USE_MOCK=false`에서는 아직 실행 불가] → `getRepository()`가 "구현되지 않았습니다"를 던지고 라우트가 오류 응답으로 바꾼다(기존 동작).
- [`review-dashboard-ui`와 같은 파일(`api-client.ts`, `Dashboard.tsx`)을 수정] → 이 변경을 먼저 끝내고 `review-dashboard-ui`의 남은 시각 확인을 진행한다.

## Open Questions

- 4단계에서 Pinecone 레코드에 `date`, `helpful_votes`를 필드로 넣을지(CLAUDE.md의 적재 레코드는 `{ _id, text, rating, author, title, content }`). 이 변경의 스펙·태스크에는 영향이 없으므로 4단계 설계에서 정한다.
