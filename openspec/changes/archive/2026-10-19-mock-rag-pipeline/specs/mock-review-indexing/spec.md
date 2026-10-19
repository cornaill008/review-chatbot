# Spec Delta

## MODIFIED Requirements

### Requirement: 샘플 리뷰 인덱싱 API
시스템은 `POST /api/index-data` 요청을 받으면 `samples/review.csv`의 모든 유효 행을 리뷰 스토어에 적재하고, 적재 건수를 `{ success: true, mode, data: { indexed } }` 형태로 반환해야 한다(SHALL). `mode`는 현재 데이터 모드(`'mock'` 또는 `'real'`)이고 `indexed`는 적재된 리뷰 건수(숫자)이다.

#### Scenario: 인덱싱 성공
- **WHEN** 유효한 `samples/review.csv`가 존재하는 상태에서 인덱싱을 요청한다
- **THEN** 응답은 `success: true`, `mode: 'mock'`이며 `data.indexed`는 적재된 리뷰 건수와 같다

#### Scenario: 100건 샘플
- **WHEN** 유효한 행이 100개인 `samples/review.csv`로 인덱싱을 요청한다
- **THEN** `data.indexed`는 100이다

#### Scenario: 재인덱싱
- **WHEN** 이미 인덱싱된 상태에서 다시 인덱싱을 요청한다
- **THEN** 기존 데이터는 새 데이터로 대체되어 리뷰가 중복 적재되지 않는다

### Requirement: 리뷰 레코드 필드
시스템은 각 리뷰를 `id`, `rating`, `author`, `title`, `content`, `date`, `helpfulVotes` 필드로 보관해야 한다(SHALL). 검색 대상 텍스트는 제목과 내용을 합친 값이다. `date`는 CSV의 문자열 그대로 보관하고, `helpfulVotes`는 CSV의 `helpful_votes`를 정수로 변환한 값이며 변환할 수 없으면 0이다.

#### Scenario: 필드 보존
- **WHEN** CSV의 한 행이 적재된다
- **THEN** 해당 행의 평점, 작성자, 제목, 내용, 작성일이 검색 결과와 참고 리뷰에서 그대로 조회된다

#### Scenario: 도움이 됨 수 변환
- **WHEN** CSV 행의 `helpful_votes`가 `12`이다
- **THEN** 해당 리뷰의 `helpfulVotes`는 숫자 12이다

#### Scenario: 도움이 됨 수 누락
- **WHEN** `helpful_votes` 컬럼이 없거나 값이 숫자가 아니다
- **THEN** 해당 리뷰의 `helpfulVotes`는 0이고 적재는 계속된다
