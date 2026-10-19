# Tasks

## 1. 준비

- [x] 1.1 `lucide-react`를 설치하고 `npm run build`가 통과하는지, design.md 7의 아이콘들이 설치 버전에 모두 export되는지 확인 (없으면 대체 아이콘으로 design.md 갱신)
- [x] 1.2 `layout.tsx`의 메타데이터를 "쇼핑 리뷰 AI 분석기"로, `lang`을 `ko`로 수정하고 `globals.css`의 `body` 폰트를 한글 폴백 스택으로 교체한 뒤 `npm run dev`에서 한글이 올바른 폰트로 표시되는지 확인
- [x] 1.3 `dashboard-ui-and-mock-rag`가 만든 `src/lib/types.ts`(`SourceReview`, API 응답 타입)에 `StatusData`를 추가하고 `src/lib/product.ts`(상품 상수)를 작성한 뒤 `npx tsc --noEmit`이 통과하는지 확인

## 2. 상태 API

- [x] 2.1 구현 전 `node_modules/next/dist/docs/`의 Route Handler 가이드를 확인한 뒤 `src/app/api/status/route.ts`(`GET`)를 구현하고, `curl`로 인덱싱 전(`indexed:false,count:0`)과 후, `USE_MOCK` 미설정/`false`의 `mode` 값이 스펙대로 나오는지 확인 (`dashboard-ui-and-mock-rag`의 `getRepository()`가 필요하므로 그 변경의 그룹 2를 먼저 완료)
- [x] 2.2 `src/lib/api-client.ts`(`getStatus`, `runIndexing`, `sendChat`)를 구현하고, 성공·`success:false`·네트워크 오류가 모두 `ApiResult`로 변환되는 단위 테스트가 통과하는지 확인

## 3. 사이드바

- [x] 3.1 `Dashboard.tsx`(`'use client'`, 상태 관리)와 레이아웃 골격(사이드바 + 채팅 영역, 좁은 화면 대응)을 구현하고 `page.tsx`에서 렌더해 데스크톱·모바일 너비에서 레이아웃이 깨지지 않는지 브라우저에서 확인
- [x] 3.2 `Sidebar.tsx`, `ModeBadge.tsx`를 구현해 타이틀과 모드 배지(Mock 모드 / 실데이터 모드 / 확인 불가)가 `/api/status` 값에 따라 바뀌는지 브라우저에서 확인
- [x] 3.3 `IndexButton.tsx`를 구현해 스피너·비활성화(진행 중), 건수가 포함된 완료 상태, 오류 표시, 새로고침 후 상태 복원을 브라우저에서 확인
- [x] 3.4 `HistoryList.tsx`를 구현해 빈 상태, 최신순 최대 10개, 중복 질문 상단 이동, 항목 클릭 시 입력창 채우기(자동 전송 없음)를 브라우저에서 확인

## 4. 채팅 영역

- [x] 4.1 `ChatPanel.tsx`, `ProductBanner.tsx`, `MessageList.tsx`, `MessageBubble.tsx`를 구현해 상품 배너, 빈 상태 안내(예시 질문), 사용자/AI 말풍선 구분, 답변 대기 표시, 새 메시지 자동 스크롤, 오류 메시지 표시를 브라우저에서 확인
- [x] 4.2 `ChatInput.tsx`를 구현해 Enter 전송, Shift+Enter 줄바꿈, 빈 입력 차단, 대기 중 중복 전송 차단, 인덱싱 전 안내, 최대 길이 제한을 확인하고, `e.nativeEvent.isComposing` 방어를 한글로 직접 입력해(조합 중 Enter 시 전송되지 않고 한 번만 전송됨) 확인
- [x] 4.3 `SourceAccordion.tsx`, `SourceCard.tsx`를 구현해 "참고 리뷰 N건" 배지, 기본 접힘, 펼침 시 카드(평점 별, 작성자, 제목, 내용), 0건일 때 미표시, `aria-expanded` 동작을 브라우저에서 확인

## 5. 마무리 검증

- [x] 5.1 모든 아이콘 버튼의 `aria-label`, 키보드 탐색(Tab 순서, 아코디언 Enter/Space)을 확인하고 `npm run lint`와 `npm run build`가 통과하는지 확인
- [ ] 5.2 인덱싱 → 질문 → 답변 + 참고 리뷰 아코디언 → 히스토리 클릭 → 재질문 흐름을 브라우저에서 end-to-end로 확인 (`dashboard-ui-and-mock-rag`의 API 구현 필요)

## Workflow follow-up

- 이 변경은 `dashboard-ui-and-mock-rag`(API·데이터 계층 전용)를 먼저 구현한 뒤 진행한다.
- 구현 완료 후 `/opsx:archive`로 아카이브한다.
- 단위 작업별로 Conventional Commits(`feat:`, `fix:`, `refactor:`) 형식의 한국어 커밋 메시지로 커밋한다.
