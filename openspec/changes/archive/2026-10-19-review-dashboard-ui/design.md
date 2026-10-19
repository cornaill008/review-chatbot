# Design

## Context

현재 UI 코드는 `create-next-app` 기본 템플릿(`src/app/page.tsx`)뿐이다. 동기는 proposal.md, 요구사항은 `specs/`를 따른다.

관찰된 제약:
- CLAUDE.md: 클라이언트 상태가 필요한 곳에만 `'use client'`, UI는 Mock/Real을 몰라야 함, API 응답 포맷 고정, IME는 `e.nativeEvent.isComposing` 확인.
- `layout.tsx`는 `lang="en"`, 메타데이터가 기본값이며 폰트는 Geist(라틴 전용), `globals.css`의 `body` 폰트는 `Arial`이다. 한글 표시를 위해 폰트 스택 조정이 필요하다.
- Tailwind v4(`@import "tailwindcss"`)와 `prefers-color-scheme` 기반 다크 변수가 이미 있다.
- Next.js 16.4(`cacheComponents` 활성)이며 `AGENTS.md`가 번들 문서 확인을 요구한다. `layout.tsx`는 전역 `LayoutProps<"/">` 타입 헬퍼를 사용한다.
- 인덱싱·채팅 API와 `ReviewRepository`는 변경 `dashboard-ui-and-mock-rag`가 정의한다. 이 변경의 UI와 `/api/status`는 그 계약에 의존한다.

## Goals / Non-Goals

**Goals:**
- 한 화면에서 인덱싱 → 질문 → 근거 리뷰 확인 흐름이 끊김 없이 동작하는 대시보드.
- UI가 모드를 판단하지 않고 서버가 준 값만 표시.
- 키보드·스크린리더 사용이 가능한 기본 접근성.

**Non-Goals:**
- 인덱싱·채팅 API 구현, 스트리밍 응답, 히스토리 영속화, 인증, 테마 토글.

## Decisions

### 1. 컴포넌트 구조: 상태는 `Dashboard` 한 곳에 모은다
```
src/app/page.tsx              (서버 컴포넌트, <Dashboard/> 렌더)
src/components/Dashboard.tsx   ('use client') 상태: status, indexState, messages, history, draft, pending
 ├─ Sidebar.tsx
 │   ├─ ModeBadge.tsx
 │   ├─ IndexButton.tsx        (idle / loading / done / error)
 │   └─ HistoryList.tsx
 └─ ChatPanel.tsx
     ├─ ProductBanner.tsx
     ├─ MessageList.tsx        (빈 상태, 자동 스크롤)
     │   └─ MessageBubble.tsx  (user / assistant / error)
     │       └─ SourceAccordion.tsx → SourceCard.tsx
     └─ ChatInput.tsx          (textarea, IME 방어, 전송 버튼)
```
표시 전용 하위 컴포넌트는 props만 받고 `'use client'`를 따로 선언하지 않는다(부모가 클라이언트이므로 불필요). 훅 사용이 있는 컴포넌트만 선언한다.
- 대안: 전역 상태 라이브러리(Zustand 등) → 상태가 한 화면에 국한되어 과해 기각.

### 2. API 호출은 얇은 클라이언트 모듈로 격리
`src/lib/api-client.ts`에 `getStatus()`, `runIndexing()`, `sendChat(message)`를 두고 응답 규격(`success` 플래그)을 해석해 `Result` 형태로 돌려준다. 컴포넌트는 `fetch`를 직접 호출하지 않는다. 네트워크 오류는 `{ success: false, error }`로 변환한다.

### 3. 모드 배지는 `/api/status`의 값을 그대로 표시
마운트 시 `GET /api/status`를 호출해 `mode`, `indexed`, `count`를 상태에 저장한다. UI에는 `USE_MOCK` 참조나 모드별 분기 로직을 두지 않고, 라벨 매핑(`mock`→"Mock 모드", `real`→"실데이터 모드")만 둔다. 실패 시 "모드 확인 불가" 배지를 표시한다.
- 대안: `NEXT_PUBLIC_USE_MOCK`로 클라이언트가 직접 판단 → 서버·클라이언트 값이 어긋날 수 있고 CLAUDE.md의 "UI는 모드를 몰라야 함"에 반해 기각.

`/api/status`(`src/app/api/status/route.ts`)는 `GET`만 export하며 `dashboard-ui-and-mock-rag`의 `getRepository()`로 `indexed`/`count`를 읽는다. `cacheComponents` 환경에서 충돌 가능한 route segment config는 쓰지 않고, 구현 전 번들 문서의 Route Handler 가이드를 확인한다.

### 4. 입력창은 `<textarea>` + 제어 컴포넌트
`onKeyDown`에서 `e.nativeEvent.isComposing`이면 즉시 return하고, Enter(Shift 없음)만 전송하며 `preventDefault()`한다. Shift+Enter는 기본 동작(줄바꿈)을 유지한다. 전송 가능 조건은 `draft.trim() !== ''`, `!pending`, 인덱싱 완료 상태이다. 인덱싱 전에는 전송을 시도하면 안내 메시지를 스트림에 보여준다.
- 대안: `keyCode === 229` 검사 → 비표준·deprecated라 기각. `onCompositionStart/End` 플래그 직접 관리 → `isComposing`으로 충분해 기각.

### 5. 질문 히스토리는 클라이언트 배열
전송 시 `[question, ...history].slice(0, 10)`로 갱신한다(중복 질문은 맨 위로 이동). 항목 클릭은 `draft`를 채우고 입력창에 포커스만 준다. 영속화(localStorage 등)는 하지 않는다.

### 6. 참고 리뷰 아코디언
네이티브 `<details>/<summary>` 대신 버튼 + `aria-expanded` + `aria-controls`로 구현해 아이콘 회전과 배지 스타일을 제어한다. 기본 접힘. 배지는 `sources.length`를 표시하고 0건이면 렌더링하지 않는다. 카드는 평점을 `Star` 아이콘 반복으로 나타내고, 평점 값은 숫자로도 병기한다.

### 7. lucide-react 아이콘 매핑
| 위치 | 아이콘 |
|---|---|
| 서비스 타이틀 | `MessageSquareText` |
| 모드 배지 | Mock `FlaskConical` / 실데이터 `Database` / 확인 불가 `CircleHelp` |
| 인덱싱 버튼 | idle `DatabaseZap` / loading `Loader2`(`animate-spin`) / done `CheckCircle2` / error `AlertCircle` |
| 히스토리 | 헤더 `History`, 항목 `MessageCircleQuestion`, 빈 상태 `Inbox` |
| 상품 배너 | `Package` |
| 사용자/AI 구분 | `User` / `Bot` |
| 답변 대기 | `Loader2` |
| 참고 리뷰 | 토글 `ChevronDown`, 배지 `Quote`, 평점 `Star` |
| 입력/전송 | `SendHorizontal` (aria-label "질문 전송") |
| 오류 | `TriangleAlert` |
아이콘 이름은 구현 시 설치된 lucide-react 버전의 export에 맞춰 확인하고, 없으면 같은 의미의 대체 아이콘을 쓴다.

### 8. 스타일·한글 폰트
Tailwind 유틸리티로 구성한다. `body`의 `Arial` 하드코딩을 `var(--font-sans)` + 한글 시스템 폰트 폴백(`"Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif`)으로 바꾼다. 다크 모드는 기존 `prefers-color-scheme` 변수를 따른다. 레이아웃은 `h-dvh` 기준 `flex`: 데스크톱은 사이드바 고정폭(`w-72`) + 채팅 영역 `flex-1`, 좁은 화면(`md` 미만)에서는 사이드바를 상단에 쌓고 접을 수 있게 한다. 메시지 스트림만 스크롤되도록 한다.

### 9. 상품 정보는 상수
`src/lib/product.ts`에 `{ name: '노이즈캔슬링 무선 이어폰 PRO', ... }`를 둔다. Real Mode에서 상품이 데이터에서 오게 될 때 이 모듈만 교체한다.

## Risks / Trade-offs

- [API가 아직 구현되지 않으면 UI 종단 확인 불가] → `dashboard-ui-and-mock-rag`의 그룹 2~3을 먼저 구현하거나, 그때까지 `api-client` 단위 테스트와 임시 응답 스텁(커밋하지 않음)으로 UI를 확인한다.
- [`cacheComponents` 환경에서의 서버/클라이언트 경계 동작이 예상과 다를 수 있음] → 구현 중 번들 문서로 확인하고, 설정을 임의로 끄지 말고 사용자에게 알린다.
- [아이콘 이름이 설치 버전에 없을 수 있음] → 구현 시 export 존재를 확인하고 대체한다.
- [히스토리가 새로고침 시 사라짐] → 의도된 범위. 영속화는 Real Mode의 `messages` 테이블 단계에서 다룬다.
- [textarea 줄바꿈 허용으로 긴 입력이 가능] → 최대 길이(예: 500자)를 제한하고 초과 시 입력을 막는다.
