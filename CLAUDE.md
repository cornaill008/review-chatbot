# Review Chatbot Guidelines

## Project Overview
Next.js 16 (App Router) 기반의 쇼핑 리뷰 분석 RAG(Retrieval-Augmented Generation) 챗봇입니다.
초반에는 외부 인프라 설정 병목 없이 **로컬 Mock 데이터(`samples/review.csv` + 인메모리 스토어)** 기반으로 전체 UI와 RAG 파이프라인을 먼저 완성하고, 이후 실제 데이터 영속화와 벡터 검색이 필요한 시점에 **Pinecone**과 **Supabase**를 연동한 뒤 **Vercel**로 배포합니다.

## Tech Stack & Architecture
- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS, Lucide React
- **Generation**: LangChain.js (`@langchain/core`, `@langchain/anthropic`) — 프롬프트 조립 및 답변 생성 전용
- **Data & Retrieval Strategy (`USE_MOCK` 환경변수 분기)**:
  - **Mock Mode (`process.env.USE_MOCK !== 'false'`)**: 로컬 `samples/review.csv`를 파싱하여 키워드/토큰 매칭 점수로 상위 5건을 검색하고, 대화 히스토리는 서버 인메모리 배열에 저장 (외부 DB 가입 없이 즉시 동작)
  - **Real Mode (`process.env.USE_MOCK === 'false'`)**:
    - **Vector DB**: `@pinecone-database/pinecone` SDK 직접 호출 (`review-chatbot` 통합 임베딩 인덱스: `llama-text-embed-v2`, 1024 dim, cosine)
    - **Database**: Supabase PostgreSQL (`reviews`, `messages` tables)
- **LLM**: Anthropic `claude-haiku-4-5` (주최측 제공 API Key 사용)
- **Spec-Driven Development (SDD)**: OpenSpec (`openspec/`) 기반 명세 주도 개발 (`openspec init` ➡️ `/opsx:propose` ➡️ `/opsx:apply` ➡️ `/opsx:archive`)

## 🚫 절대 금지 사항 (Hard Constraints)
1. **`@langchain/pinecone`의 `PineconeStore`를 사용하지 않는다.**
   본 프로젝트의 Pinecone 인덱스는 통합 임베딩 인덱스이므로 클라이언트 측 Embeddings 객체를 주입하는 `PineconeStore`와 호환되지 않는다.
2. **`OpenAIEmbeddings` 등 외부 임베딩 라이브러리를 추가하지 않는다.**
   Anthropic API는 임베딩 엔드포인트를 제공하지 않으며, 본 실습에는 임베딩용 키가 존재하지 않는다.
3. 실제 Pinecone 연동 단계(4단계)에서 벡터 적재는 반드시 `namespace.upsertRecords()`, 검색은 반드시 `namespace.searchRecords()`를 사용한다.
   - 적재 레코드 형태: `{ _id, text, rating, author, title, content }` (`text`가 임베딩 대상 필드)
   - 검색 결과: `res.result.hits[]` → 각 hit의 `_id` / `_score` / `fields`
4. 모델 ID는 `claude-haiku-4-5`를 사용한다. 날짜 suffix를 붙이지 않는다.

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
   - Supabase 공개 키는 `process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` 순으로 fallback 처리합니다.
6. **API Response Format**:
   - 모든 API 응답은 `{ success: boolean, data?: unknown, error?: string }` (또는 `/api/chat`의 `{ success: boolean, answer?: string, sources?: SourceReview[], error?: string }`) 포맷을 일관되게 반환합니다.
7. **Git Commit Rule**:
   - 단위 작업 완료 후 Conventional Commits 규칙(`feat:`, `fix:`, `refactor:`)에 맞춰 간결한 한국어 커밋 메시지를 작성합니다.
