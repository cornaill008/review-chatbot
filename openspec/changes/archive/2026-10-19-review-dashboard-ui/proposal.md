# Proposal

## Why

현재 `src/app/page.tsx`는 `create-next-app` 기본 템플릿이고, 챗봇 화면이 없다. 쇼핑 리뷰 분석 챗봇의 핵심 사용 경험인 "데이터 인덱싱 → 질문 → 근거 리뷰와 함께 답변 확인"을 한 화면에서 수행할 메인 대시보드 UI를 먼저 정의하고 구현한다. UI가 Mock Mode와 Real Mode를 구분하지 않고 동일한 API 응답 규격만으로 동작하도록 해, 이후 Pinecone/Supabase 전환 시 화면 변경을 없앤다.

## What Changes

- 기본 템플릿 페이지를 2단 대시보드(좌측 사이드바 + 우측 채팅 영역)로 교체하고, 앱 메타데이터와 `<html lang>`을 한국어 챗봇에 맞게 수정한다.
- **사이드바**: 서비스 타이틀 "쇼핑 리뷰 AI 분석기", 데이터 모드 배지("Mock 모드" / "실데이터 모드"), [샘플 데이터 인덱싱] 버튼(로딩 스피너·완료 상태), 최근 분석 질문 히스토리 목록.
- **채팅 영역**: 상단 분석 대상 상품 정보 배너, 중앙 대화 메시지 스트림(사용자 질문/AI 답변), AI 답변 하단 참고 리뷰 아코디언과 배지(Top 3~5), 하단 질문 입력창과 전송 버튼.
- 입력창은 `onKeyDown`에서 `e.nativeEvent.isComposing`을 항상 확인해 한글 IME 엔터 중복 전송을 방지한다.
- 모든 아이콘은 `lucide-react`를 적극 사용한다.
- 모드 배지와 새로고침 후 인덱싱 상태 복원을 위해 `GET /api/status`를 추가한다. UI는 응답의 `mode` 값을 표시만 하고 모드를 판단하지 않는다.

범위 밖: 인덱싱·채팅 API 자체의 구현(별도 변경 `dashboard-ui-and-mock-rag`), 토큰 스트리밍, 사용자 인증, 다국어, 다크 모드 토글(시스템 설정 따라가기만).

## Capabilities

### New Capabilities
- `review-dashboard-ui`: 사이드바, 상품 배너, 메시지 스트림, 참고 리뷰 아코디언, IME 안전한 입력으로 구성된 메인 대시보드 화면 동작.
- `data-mode-status`: 현재 데이터 모드와 인덱싱 상태를 알려주는 `GET /api/status` 응답 규격과 동작.

### Modified Capabilities
<!-- 기존 main 스펙이 없으므로 없음 -->

## Impact

- 수정 코드: `src/app/page.tsx`, `src/app/layout.tsx`(메타데이터, `lang="ko"`, 한글 폰트 스택), `src/app/globals.css`.
- 신규 코드: `src/components/`(Dashboard, Sidebar, ModeBadge, IndexButton, HistoryList, ProductBanner, ChatPanel, MessageBubble, SourceAccordion, SourceCard, ChatInput), `src/app/api/status/route.ts`, `src/lib/product.ts`.
- 신규 의존성: `lucide-react`.
- API 계약: `POST /api/index-data`, `POST /api/chat`의 요청·응답은 `dashboard-ui-and-mock-rag` 변경의 스펙을 따른다. 응답은 CLAUDE.md 포맷(`{ success, data?, error? }`, `/api/chat`은 `{ success, answer?, sources?, error? }`)을 따른다.
- 변경 간 관계: `dashboard-ui-and-mock-rag`는 API·데이터 계층 전용으로 줄었고 `review-dashboard-ui` 스펙은 이 변경이 단독으로 소유한다. 구현은 `dashboard-ui-and-mock-rag`를 먼저 진행한다. `src/lib/types.ts`는 그 변경이 만들고 이 변경은 `StatusData`만 추가한다.
- 가정: 상품 정보는 Mock 단계에서 `src/lib/product.ts` 상수(예: "노이즈캔슬링 무선 이어폰 PRO")로 둔다. 질문 히스토리는 클라이언트 상태(새로고침 시 초기화)로만 보관하고, 항목 클릭 시 입력창에 채우되 자동 전송하지 않는다.
- 가정: 이 프로젝트의 Next.js는 `AGENTS.md`가 번들 문서(`node_modules/next/dist/docs/`) 확인을 요구하고 `next.config.ts`에 `cacheComponents`가 켜져 있으므로, 구현 시 해당 문서를 따른다.
