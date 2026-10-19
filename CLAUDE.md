# Review Chatbot Guidelines

## Project Overview
Next.js 16 (App Router) 기반의 쇼핑 리뷰 분석 RAG(Retrieval-Augmented Generation) 챗봇입니다.
초반에는 외부 인프라 설정 병목 없이 **로컬 Mock 데이터(`samples/review.csv` + 인메모리 스토어)** 기반으로 전체 UI와 RAG 파이프라인을 먼저 완성하고, 이후 실제 데이터 영속화와 벡터 검색이 필요한 시점에 **Pinecone**과 **Supabase**를 연동한 뒤 **Vercel**로 배포합니다.

## Tech Stack & Architecture
- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS, Lucide React
- **Generation**: LangChain.js (`@langchain/core`, `@langchain/openai`) — 프롬프트 조립 및 답변 생성 전용 (Kimi는 OpenAI 호환 API라 `ChatOpenAI`에 `baseURL`을 지정해 사용)
- **Data & Retrieval Strategy (`USE_MOCK` 환경변수 분기)**:
  - **Mock Mode (`process.env.USE_MOCK !== 'false'`)**: 로컬 `samples/review.csv`를 파싱하여 키워드/토큰 매칭 점수로 상위 5건을 검색하고, 대화 히스토리는 서버 인메모리 배열에 저장 (외부 DB 가입 없이 즉시 동작)
  - **Real Mode (`process.env.USE_MOCK === 'false'`)**:
    - **Vector DB**: `@pinecone-database/pinecone` SDK 직접 호출 (`review-chatbot` 통합 임베딩 인덱스: `llama-text-embed-v2`, 1024 dim, cosine)
    - **Database**: Supabase PostgreSQL (`reviews`, `messages` tables)
- **LLM**: Kimi (Moonshot AI) `kimi-k2.6` — OpenAI 호환 API(`https://api.moonshot.ai/v1`), `KIMI_API_KEY` 사용.
  - 모델과 엔드포인트는 `KIMI_MODEL`, `KIMI_BASE_URL`로 바꿀 수 있다(없으면 위 기본값). 이 키는 국제(`.ai`) 엔드포인트에서만 인증된다.
  - `kimi-k2.6`은 `temperature`로 1만 허용하므로 지정하지 않고, 추론(thinking)은 끈다.
  - `KIMI_API_KEY`가 없으면 답변 생성을 생략하고 검색 결과 JSON만 응답한다.
- **Spec-Driven Development (SDD)**: OpenSpec (`openspec/`) 기반 명세 주도 개발 (`openspec init` ➡️ `/opsx:propose` ➡️ `/opsx:apply` ➡️ `/opsx:archive`)

## 🚫 절대 금지 사항 (Hard Constraints)
1. **`@langchain/pinecone`의 `PineconeStore`를 사용하지 않는다.**
   본 프로젝트의 Pinecone 인덱스는 통합 임베딩 인덱스이므로 클라이언트 측 Embeddings 객체를 주입하는 `PineconeStore`와 호환되지 않는다.
2. **`OpenAIEmbeddings` 등 외부 임베딩 라이브러리를 추가하지 않는다.**
   본 실습에는 임베딩용 키가 존재하지 않고, 임베딩은 Pinecone 통합 임베딩 인덱스가 서버 측에서 처리한다.
   채팅 모델용 `@langchain/openai`의 `ChatOpenAI`(Kimi 호출)는 허용하며, 같은 패키지의 `OpenAIEmbeddings` 등 Embeddings 클래스는 사용하지 않는다.
3. 실제 Pinecone 연동 단계(4단계)에서 벡터 적재는 반드시 `namespace.upsertRecords()`, 검색은 반드시 `namespace.searchRecords()`를 사용한다.
   - 적재 레코드 형태: `{ _id, text, rating, author, title, content }` (`text`가 임베딩 대상 필드)
   - 검색 결과: `res.result.hits[]` → 각 hit의 `_id` / `_score` / `fields`
   - SDK 9.x 호출 형태: `ns.upsertRecords({ records })`(배열을 직접 넘기면 `options.records is not iterable`로 실패, 96개 이하씩 순차 호출), `ns.searchRecords({ query: { topK, inputs: { text } }, fields })`. 네임스페이스는 `reviews`.
4. 모델 ID는 기본 `kimi-k2.6`이며 코드 곳곳에 적지 않고 `DEFAULT_MODEL` 상수와 `KIMI_MODEL` 환경변수로만 다룬다.

## Development Workflow & Rules
1. **Spec-Driven Development (OpenSpec) or Plan First**:
   - 기능 추가·변경 전에는 OpenSpec의 `/opsx:propose`로 변경 명세(`proposal.md`, `specs/`, `design.md`, `tasks.md`)를 먼저 수립한 뒤 `/opsx:apply`로 구현하고, 완료 후 `/opsx:archive`로 아카이브합니다. (또는 Claude Code 기본 `/plan` 모드를 활용합니다.)
2. **Mock-First & Clean Boundary**:
   - 프론트엔드 UI 컴포넌트는 현재 모드가 Mock인지 실제 DB(Supabase/Pinecone)인지 알 필요 없도록 동일한 API 응답 규격을 유지합니다.
3. **App Router Conventions**:
   - `src/app` 구조를 유지합니다.
   - 클라이언트 상태가 필요한 경우에만 명시적으로 `'use client'` 지시어를 선언합니다.
   - API 라우트는 `src/app/api/.../route.ts` 규격을 준수합니다.
4. **Defensive UI Implementation**:
   - 한글 입력 시 IME 중복 전송 버그를 방지하기 위해 `onKeyDown` 이벤트에서 `e.nativeEvent.isComposing` 상태를 항상 체크합니다.
5. **Environment Variables**:
   - 환경변수는 하드코딩하지 않고 항상 `process.env.*`를 참조합니다.
   - Supabase 공개 키는 `process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` 순으로(비어 있지 않은 첫 값) fallback 처리합니다. (구 프로젝트라 anon 키만 보이는 경우 `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 사용)
   - 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`가 있으면 위 공개 키보다 먼저 쓴다. 이 키는 RLS를 우회하므로 `NEXT_PUBLIC_` 접두사를 붙이거나 클라이언트 코드에서 읽지 않는다. `supabase/harden-rls.sql`로 공개 키의 접근을 막은 뒤에는 이 키가 필수다.
   - 사용하는 환경변수 (`.env.local`에 두며 git에 올리지 않는다):
     - `USE_MOCK`: `'false'`가 아니면 Mock 모드. 4단계 구현이 끝나기 전에는 `true`를 유지한다.
     - `KIMI_API_KEY`: LLM(Kimi) API 키. 선택: `KIMI_MODEL`(기본 `kimi-k2.6`), `KIMI_BASE_URL`(기본 `https://api.moonshot.ai/v1`).
     - `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`(`review-chatbot`): Pinecone 연결 정보(필수). `PINECONE_HOST`는 선택이며, 없거나 예시 값(`xxxx`)이면 SDK가 인덱스 이름으로 호스트를 찾는다.
     - `NEXT_PUBLIC_SUPABASE_URL`, Supabase 공개 키(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 등 위 fallback 순서): Supabase 연결 정보(필수).
     - 실데이터 모드에서 위 필수 변수가 하나라도 없으면 외부 요청 없이 빠진 변수 이름만 담은 오류를 응답한다.
   - 키 값은 코드, 문서, 커밋 메시지에 적지 않는다. `.env.example`에는 변수 이름과 빈 값만 둔다.
6. **API Response Format**:
   - 모든 API 응답은 `{ success: boolean, data?: unknown, error?: string }` (또는 `/api/chat`의 `{ success: boolean, answer?: string, sources?: SourceReview[], error?: string }`) 포맷을 일관되게 반환합니다.
7. **Git Commit Rule**:
   - 단위 작업 완료 후 Conventional Commits 규칙(`feat:`, `fix:`, `refactor:`)에 맞춰 간결한 한국어 커밋 메시지를 작성합니다.
