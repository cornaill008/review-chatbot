# Tasks

## 1. 표기 변환 함수

- [x] 1.1 `src/lib/format.ts`에 `formatReviewDate`(`YYYY-MM-DD`→`YYYY.MM.DD`, 다른 형식은 원문, 빈 값은 `null`)와 `toMatchPercent`(반올림, 0~100 제한, 숫자가 아니면 `null`)를 구현하고, 정상·다른 형식·빈 값·0.885·1.2·-0.1·NaN·undefined 단위 테스트가 통과하는지 확인

## 2. 카드 구성

- [x] 2.1 `SourceCard.tsx`에 작성자(`User`)·작성일(`Calendar`) 메타 태그를 추가하고 값이 없으면 태그를 숨기며, 별점은 기존 구현을 유지한 채 4점·7점·-1점 케이스 테스트(채워진 별 개수와 `aria-label`)가 통과하는지 확인
- [x] 2.2 `SourceCard.tsx`에 `Target` 아이콘의 "N% 일치" 배지를 추가하고(툴팁 `title`과 `aria-label`로 표시용 점수임을 설명), 0.89·0.885·1.2·점수 없음 케이스와 설명 문구가 있는지 테스트가 통과하는지 확인

## 3. 내용 말줄임과 펼치기

- [x] 3.1 `src/components/ExpandableText.tsx`를 구현해(`line-clamp-2`, `scrollHeight`/`clientHeight`로 넘침 감지, `ResizeObserver` 재측정, 넘칠 때만 "더보기"/"접기" 버튼과 본문 클릭 토글, `aria-expanded`) `SourceCard`의 내용에 적용하고, 긴 내용·짧은 내용·펼치기/접기·본문 클릭·키보드(Enter/Space)·카드별 독립·너비 변화·`ResizeObserver` 없는 환경 테스트가 통과하는지 확인

## 4. 통합 확인

- [x] 4.1 `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`가 모두 통과하는지 확인
- [x] 4.2 실제 Chrome에서 긴 내용이 2줄에서 말줄임되고 펼치면 높이가 늘어나며 다시 접히는지, 짧은 내용에는 버튼이 없는지, 닫힌 아코디언을 열었을 때 긴 카드에 "더보기"가 나타나는지, 데스크톱·모바일·다크 모드에서 카드가 깨지지 않는지, 일치율 배지의 툴팁이 보이는지 스크린샷으로 확인

## Workflow follow-up

- 구현 후 `/opsx:archive`로 아카이브하면 main 스펙 `review-dashboard-ui`가 갱신된다(수정 1, 추가 4).
- 단위 작업별로 Conventional Commits 형식의 한국어 커밋 메시지로 커밋한다(커밋 시점은 사용자가 정한다).
