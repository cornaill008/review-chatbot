# Design

## Context

현재 코드는 `create-next-app` 기본 골격(Next.js 16.4.2, React 19.3, Tailwind v4, `src/app`의 기본 페이지)뿐이다. 동기와 범위는 proposal.md, 요구사항은 `specs/`를 따른다.

관찰된 제약:
- CLAUDE.md: Mock-First, 프론트는 모드를 몰라야 함, API 응답 포맷 고정, 모델 ID `claude-haiku-4-5`(날짜 suffix 없음), 임베딩 라이브러리·`PineconeStore` 금지.
- 이 변경은 API와 데이터 계층 전용이다. 화면은 `review-dashboard-ui` 변경이 담당하며, 그 변경이 이 변경의 응답 규격과 `ReviewRepository`에 의존한다.
- `next.config.ts`에 `cacheComponents`와 `partialPrefetching`이 켜져 있다. 이 Next.js 버전은 학습 데이터와 다를 수 있으며 `AGENTS.md`가 `node_modules/next/dist/docs/` 확인을 요구한다. 확인 결과 POST 라우트 핸들러는 요청 시점에 동적으로 실행된다.
- `package.json`의 `lint` 스크립트는 `eslint`이다.

## Goals / Non-Goals

**Goals:**
- Mock Mode만으로 인덱싱 → 질문 → 답변+출처(sources) 반환까지 API 수준에서 end-to-end 동작.
- Real Mode(Pinecone/Supabase) 전환 시 라우트 시그니처와 응답 규격이 바뀌지 않는 경계(인터페이스) 확보.

**Non-Goals:**
- 대시보드 UI와 `GET /api/status`(`review-dashboard-ui`), Real Mode 구현체, 인증, 다중 사용자 세션 분리, 토큰 스트리밍, 배포 설정.

## Decisions

### 1. 데이터 계층은 `ReviewRepository` 인터페이스 + 팩토리로 분기
`src/lib/repository/`에 `index()`, `search(query, topK)`, `isIndexed()`, `count()`, `appendMessage()`, `getHistory()`를 가진 인터페이스를 두고, `getRepository()`가 `process.env.USE_MOCK !== 'false'`이면 Mock 구현을 반환한다. 라우트와 UI는 구현을 모른다. `isIndexed()`/`count()`는 `review-dashboard-ui`의 `GET /api/status`가 사용한다.
- 대안: 라우트 안에서 `if (USE_MOCK)` 분기 → 모드별 코드가 라우트에 퍼져 Real 전환 시 수정 범위가 커져 기각.

### 2. 인메모리 스토어는 `globalThis`에 보관
개발 모드(HMR)와 라우트별 번들링으로 모듈 변수 상태가 초기화되거나 `/api/index-data`와 `/api/chat` 사이에 공유되지 않을 수 있다. `globalThis`에 리뷰 배열과 히스토리를 저장해 두 라우트가 같은 상태를 보게 한다.
- 대안: 매 요청마다 CSV 재파싱 → "인덱싱" 개념과 상태 표시가 무의미해져 기각.

### 3. Mock 검색은 토큰 매칭 점수
질문을 소문자화·공백/문장부호 기준으로 토큰화(길이 1 토큰 제외)하고, 리뷰 `title + content`에 토큰이 포함되는 개수를 점수로 한다(제목 매칭 가중치 2). 점수 > 0만 점수 내림차순 상위 5건, 동점은 원래 순서. 형태소 분석은 하지 않고 부분 문자열 포함 매칭으로 조사 변화를 어느 정도 흡수한다.

### 4. 답변 생성은 LangChain.js 체인
`ChatAnthropic({ model: 'claude-haiku-4-5' })` + `ChatPromptTemplate`(시스템: 제공된 리뷰만 근거, 한국어, 근거 없으면 모른다고 답변 / 히스토리 / 리뷰 컨텍스트 / 질문) → 문자열 출력. 검색은 LangChain을 거치지 않고 repository가 담당한다. 검색 결과가 0건이면 LLM을 호출하지 않고 고정 안내 문구를 반환해 비용과 환각을 줄인다.

### 4-1. API 키가 없으면 답변 생성을 생략하고 검색 결과를 JSON으로 응답
`ANTHROPIC_API_KEY`가 비어 있으면 `/api/chat`은 `generateAnswer`를 호출하지 않고, 검색 결과를 `JSON.stringify(..., null, 2)`한 문자열을 `answer`로 돌려준다(`sources`는 빈 배열). 클라이언트는 이 값을 평소 답변과 똑같이 말풍선에 표시할 뿐이며 별도 분기를 두지 않는다(응답 규격 유지). 키 유무는 서버 환경에서만 판단한다.
- 대안: `SKIP_LLM` 같은 별도 환경변수 → `.env.local` 없이는 켤 수 없어 기각. 키 없음을 오류로 유지 → 키 없는 환경에서 검색 결과를 확인할 방법이 없어 기각.
- 이 동작은 응답 JSON을 파싱해 쓰는 곳이 없다는 전제의 개발·시연용 폴백이다. 키가 설정되면 자동으로 일반 동작으로 돌아간다.

### 5. CSV 파싱
`papaparse`로 헤더 기반 파싱한다. 필수 컬럼 `rating`, `title`, `content`(`author`는 없으면 빈 값). `id` 컬럼은 선택이며 값이 있으면 그대로 쓰고, 없거나 비었거나 중복이면 `review-N`을 부여한다(화면의 `key`가 고유해야 하므로 id는 항상 고유하게 유지). 그 밖의 컬럼(`date`, `helpful_votes`, `verified_purchase` 등)은 읽지 않고 무시한다. UTF-8 가정, 경로는 `process.cwd()` 기준 `samples/review.csv`. 컬럼 매핑은 `csv.ts` 한 곳에 격리한다.

### 6. Next.js 16 규칙 준수
- 라우트 핸들러는 `src/app/api/.../route.ts`에 `POST`만 export하고, `cacheComponents` 환경에서 충돌할 수 있는 route segment config(`export const dynamic` 등)는 사용하지 않는다.
- 구현 직전에 `node_modules/next/dist/docs/`의 해당 가이드를 확인하고 deprecation 안내를 따른다.
- 이 변경에는 클라이언트 컴포넌트가 없으므로 `'use client'`를 선언하지 않는다.

### 7. 파일 구조
```
src/app/api/index-data/route.ts
src/app/api/chat/route.ts
src/lib/{repository,csv,search,chain,types}.ts
samples/review.csv
```
`src/lib/types.ts`는 이 변경이 만들고, `review-dashboard-ui`는 UI용 타입만 추가한다.

### 8. 세션 처리
이번 범위는 단일 전역 대화 히스토리 하나만 둔다. 후속 질문 문맥에는 최근 6개 메시지만 사용한다.

## Risks / Trade-offs

- [서버리스(Vercel)에서는 인메모리 상태가 유지되지 않음] → Mock Mode는 로컬 개발 전용으로 명시하고, 영속화는 Real Mode 단계에서 해결한다.
- [토큰 매칭의 낮은 검색 품질(동의어·형태 변화)] → Mock 단계의 의도된 한계. Real Mode의 벡터 검색으로 대체된다.
- [`samples/review.csv` 컬럼이 가정과 다를 수 있음] → 필수 컬럼 검증과 명확한 오류 메시지, 매핑을 `csv.ts`에 격리.
- [`ANTHROPIC_API_KEY` 없이도 인덱싱·검색 흐름을 확인할 수 있어야 함] → 키가 없으면 답변 생성을 생략하고 검색 결과 JSON을 응답한다(결정 4-1). 키 설정을 잊고 배포해도 오류 없이 JSON이 보이는 점은 인지하고 수용한다.
- [Next.js 16.4의 `cacheComponents` 동작이 예상과 다를 수 있음] → 구현 중 번들 문서로 확인하고, 문제가 생기면 설정을 임의로 끄지 말고 사용자에게 알린다.
- [전역 단일 히스토리로 탭 간 대화가 섞임] → 단일 사용자 로컬 데모 범위로 수용.
