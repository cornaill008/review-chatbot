# Proposal

## Why

저장소에는 `create-next-app`으로 생성한 Next.js 16 기본 골격만 있고, 챗봇 기능은 전혀 없다. 외부 인프라(Pinecone, Supabase) 설정 병목 없이 RAG 파이프라인을 먼저 끝까지 동작시키기 위해, 로컬 `samples/review.csv`와 인메모리 스토어만으로 동작하는 Mock RAG API를 먼저 구현한다. 이후 Real Mode 전환 시 UI 변경이 없도록 API 규격을 지금 확정한다.

> 범위 정리: 이 변경은 **API와 데이터 계층 전용**이다. 대시보드 화면은 별도 변경 `review-dashboard-ui`가 담당한다(이름은 초기 범위의 흔적이며, 변경 이름은 유지한다).

## What Changes

- `samples/review.csv` 파서와 키워드/토큰 매칭 점수 기반 Mock 검색(상위 5건) 추가.
- `POST /api/index-data`: CSV를 파싱해 인메모리 스토어에 적재하고 건수를 반환.
- `POST /api/chat`: Mock 검색 결과를 컨텍스트로 LangChain.js + `claude-haiku-4-5`로 답변을 생성하고, 대화 히스토리를 서버 인메모리 배열에 저장.
- `USE_MOCK` 환경변수(`!== 'false'`이면 Mock)로 데이터 계층을 분기하되, 이번 변경에서는 Mock 구현만 제공하고 Real Mode 구현이 들어올 `ReviewRepository` 인터페이스 경계만 정의한다. 이 인터페이스는 `review-dashboard-ui` 변경의 `GET /api/status`도 사용한다(`isIndexed()`, `count()`).
- 모든 API 응답은 CLAUDE.md 포맷(`{ success, data?, error? }`, `/api/chat`은 `{ success, answer?, sources?, error? }`)을 따른다.

범위 밖: 대시보드 UI 전체(`review-dashboard-ui`), `GET /api/status`(`review-dashboard-ui`), Pinecone/Supabase 실제 연동, 인증, Vercel 배포, 토큰 단위 스트리밍 응답.

## Capabilities

### New Capabilities
- `mock-review-indexing`: `samples/review.csv`를 파싱해 인메모리 리뷰 스토어에 적재하는 인덱싱 동작(`/api/index-data`).
- `review-rag-chat`: 질문에 대해 상위 5건 리뷰를 검색하고 근거(sources)와 함께 답변을 생성하며 대화 히스토리를 유지하는 채팅 동작(`/api/chat`).

### Modified Capabilities
<!-- 기존 스펙이 없으므로 없음 -->

## Impact

- 신규 코드: `src/app/api/index-data/route.ts`, `src/app/api/chat/route.ts`, `src/lib/`(CSV 파서, Mock 검색, 인메모리 스토어, `ReviewRepository`, LLM 체인, 공용 타입), `samples/review.csv`. 기존 파일 수정은 없다.
- 신규 의존성(현재 `package.json`에는 `next`, `react`, `react-dom`, Tailwind v4, ESLint, TypeScript만 있음): `@langchain/core`, `@langchain/anthropic`, CSV 파서(예: `papaparse`). 임베딩 라이브러리와 `@langchain/pinecone`은 추가하지 않는다(CLAUDE.md 금지 사항). `lucide-react`는 `review-dashboard-ui`에서 설치한다.
- 환경변수: `ANTHROPIC_API_KEY`, `USE_MOCK`.
- 변경 간 관계: `review-dashboard-ui`는 이 변경의 `/api/index-data`, `/api/chat` 응답 규격과 `ReviewRepository`에 의존한다. 이 변경을 먼저 구현한다. 공용 타입 파일 `src/lib/types.ts`는 이 변경이 만들고, `review-dashboard-ui`는 `StatusData` 등 UI용 타입만 추가한다.
- 가정: `samples/review.csv`가 저장소에 없으므로 컬럼을 Pinecone 적재 레코드 형태(`rating`, `author`, `title`, `content`)로 가정하고 구현 단계에서 샘플 파일을 함께 준비한다. 사용자가 이미 가진 CSV가 있으면 컬럼 매핑을 맞춘다.
- 가정: 이 프로젝트의 Next.js는 `next.config.ts`에 `cacheComponents`가 켜져 있고 `AGENTS.md`가 번들 문서(`node_modules/next/dist/docs/`) 확인을 요구하므로, 구현 시 해당 문서를 따른다.
