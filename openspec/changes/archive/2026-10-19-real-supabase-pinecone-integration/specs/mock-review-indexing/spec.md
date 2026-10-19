# Spec Delta

## MODIFIED Requirements

### Requirement: 리뷰 레코드 필드
시스템은 각 리뷰를 `id`, `rating`, `author`, `title`, `content`, `date`, `helpfulVotes`, `verifiedPurchase` 필드로 보관해야 한다(SHALL). 검색 대상 텍스트는 제목과 내용을 합친 값이다. `date`는 CSV의 문자열 그대로 보관하고, `helpfulVotes`는 CSV의 `helpful_votes`를 정수로 변환한 값이며 변환할 수 없으면 0이다. `verifiedPurchase`는 CSV의 `verified_purchase`가 `true`(대소문자 무시)이면 참, 그 외나 누락이면 거짓이다.

#### Scenario: 필드 보존
- **WHEN** CSV의 한 행이 적재된다
- **THEN** 해당 행의 평점, 작성자, 제목, 내용, 작성일이 검색 결과와 참고 리뷰에서 그대로 조회된다

#### Scenario: 도움이 됨 수 변환
- **WHEN** CSV 행의 `helpful_votes`가 `12`이다
- **THEN** 해당 리뷰의 `helpfulVotes`는 숫자 12이다

#### Scenario: 도움이 됨 수 누락
- **WHEN** `helpful_votes` 컬럼이 없거나 값이 숫자가 아니다
- **THEN** 해당 리뷰의 `helpfulVotes`는 0이고 적재는 계속된다

#### Scenario: 구매 인증 변환
- **WHEN** CSV 행의 `verified_purchase`가 `true` 또는 `TRUE`이다
- **THEN** 해당 리뷰의 `verifiedPurchase`는 참이다

#### Scenario: 구매 인증 누락
- **WHEN** `verified_purchase` 컬럼이 없거나 값이 `false`이거나 다른 문자열이다
- **THEN** 해당 리뷰의 `verifiedPurchase`는 거짓이고 적재는 계속된다
