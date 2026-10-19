# Tasks

## 1. 데이터 모델과 타입

- [x] 1.1 `src/lib/types.ts`에 `Review.date`/`helpfulVotes`, `SourceReview`(`id, title, content, rating, author, date, score`, 점수 필수), 인덱싱·채팅 응답 타입(`mode: DataMode`, `data: { indexed }`)을 반영하고 `npx tsc --noEmit`의 오류가 새 타입을 쓰는 곳으로만 좁혀지는지 확인
- [x] 1.2 `src/lib/csv.ts`가 `date`(문자열 그대로)와 `helpful_votes`(정수, 변환 불가·누락이면 0)를 읽도록 고치고, 정상·값 누락·숫자가 아닌 값·컬럼 없음 케이스와 실제 `samples/review.csv` 100건 단위 테스트가 통과하는지 확인

## 2. 검색 점수와 저장소

- [x] 2.1 `src/lib/search.ts`에 관련도(제목 2·내용 1) + `helpful_votes` 조합 점수와 0.65~0.98 정규화(design 2)를 구현하고, 범위·정렬·제목 우선·도움이 됨 수 반영·동점 순서·1건일 때 범위·짧은 키워드 케이스 단위 테스트가 통과하는지 확인
- [x] 2.2 같은 파일에 매칭 없음/키워드 없음일 때 `helpful_votes` 상위 `topK`건 기본 반환(design 3)을 구현하고, 매칭 없음·`?` 입력·리뷰 5건 미만·votes 전부 0 케이스 단위 테스트가 통과하는지 확인
- [x] 2.3 `src/lib/review-store.ts`에 `indexMockReviews`, `searchMockReviews(query, topK = 5)`, `saveMockMessage(chatId, message)`, `getMockMessages(chatId, limit?)`, `isMockIndexed`, `countMockReviews`를 구현하고(`globalThis` 스토어 소유, 대화당 200개·대화 100개 상한), 재인덱싱 중복 없음·100건 적재·`chatId` 분리·기본 대화 공유·상한 초과 시 제거 단위 테스트가 통과하는지 확인
- [x] 2.4 `ReviewRepository` 인터페이스(`appendMessage(chatId, …)`, `getHistory(chatId, limit?)`)와 `repository/mock.ts`를 `review-store.ts`를 부르는 어댑터로 바꾸고, 기존 저장소 테스트를 갱신해 통과하는지 확인

## 3. API와 체인

- [x] 3.1 `POST /api/index-data`가 `{ success: true, mode, data: { indexed } }`를 반환하게 고치고 `curl`로 `indexed: 100`, `mode: "mock"`, 파일 없음 오류(`success: false`)를 확인한 뒤 라우트 테스트를 추가
- [x] 3.2 `src/lib/chain.ts`의 시스템 프롬프트를 design 6의 문구로 바꾸고 컨텍스트를 `[리뷰 N] ★{rating} {title} — {content} (작성자: {author})`로 만들며, 컨텍스트 형식·프롬프트 규칙(추측 금지, 장단점 균형, 작성자 인용)·히스토리 6개 제한·`{}` 안전성 단위 테스트가 통과하는지 확인
- [x] 3.3 `POST /api/chat`을 `{ query, chatId? }`/`{ success, mode, answer, sources }` 계약으로 고치고(`chatId` 검증 포함, `message` 거부), `chatId`별 히스토리를 쓰도록 연결하며, 정상·빈 query·`message`만 있는 요청·잘못된 `chatId`·미인덱싱·대화 분리·실패 시 미저장 라우트 테스트가 통과하는지 확인
- [x] 3.4 `src/lib/retrieval-json.ts`와 키 없을 때의 `/api/chat` 분기를 새 필드(`date`, 점수)와 기본 반환 규칙에 맞게 고치고, `.env.local` 없이 `curl`로 매칭 없는 질문에도 5건의 JSON이 오는 것을 확인

## 4. UI 연결

- [x] 4.1 `src/lib/api-client.ts`가 `data.indexed`를 읽고 `sendChat(query, chatId)`로 `{ query, chatId }`를 보내게 고치고, 요청 본문·응답 해석·오류 변환 단위 테스트가 통과하는지 확인
- [x] 4.2 `Dashboard.tsx`가 첫 전송 때 `crypto.randomUUID()`로 `chatId`를 만들어 재사용하고 인덱싱 건수를 `indexed`로 표시하게 고치며, 같은 `chatId` 재사용·새 컴포넌트 렌더 중 난수 미사용·기존 26개 컴포넌트 테스트가 통과하는지 확인

## 5. 통합 확인

- [x] 5.1 `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`가 모두 통과하고, 빌드의 `Route (app)` 표에서 세 API가 `ƒ`(동적)인지 확인
- [x] 5.2 `curl`로 인덱싱(100건) → 질문(키 없음: JSON) → 후속 질문 흐름과 `USE_MOCK` 미설정 시 `mode: "mock"`을 확인
- [ ] 5.3 `ANTHROPIC_API_KEY`를 설정해 실제 모델 응답(`answer`, `sources`, 같은 `chatId` 후속 질문의 문맥 반영)을 `curl`과 브라우저에서 확인 (API 키 필요)

## Workflow follow-up

- 구현 후 `/opsx:archive`로 아카이브한다. 이 변경이 main 스펙을 갱신한다.
- `review-dashboard-ui`의 남은 시각·종단 확인은 이 변경 구현 후에 진행한다.
- 4단계(`USE_MOCK=false`)에서는 `review-store-real.ts`(`indexRealReviews` 등)와 `RealReviewRepository`를 추가한다.
- 단위 작업별로 Conventional Commits(`feat:`, `fix:`, `refactor:`) 형식의 한국어 커밋 메시지로 커밋한다.
