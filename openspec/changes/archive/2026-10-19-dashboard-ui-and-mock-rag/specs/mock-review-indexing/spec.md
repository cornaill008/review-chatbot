# Spec Delta

## Purpose

외부 DB 없이 로컬 샘플 리뷰 CSV를 읽어 검색 가능한 상태로 적재하는 Mock 인덱싱 동작과 그 API 응답 규격을 정의한다.

## ADDED Requirements

### Requirement: 샘플 리뷰 인덱싱 API
시스템은 `POST /api/index-data` 요청을 받으면 `samples/review.csv`의 모든 유효 행을 리뷰 스토어에 적재하고 적재 건수를 `{ success: true, data: { count } }` 형태로 반환해야 한다(SHALL).

#### Scenario: 인덱싱 성공
- **WHEN** 유효한 `samples/review.csv`가 존재하는 상태에서 인덱싱을 요청한다
- **THEN** 응답은 `success: true`이며 `data.count`는 적재된 리뷰 건수와 같다

#### Scenario: 재인덱싱
- **WHEN** 이미 인덱싱된 상태에서 다시 인덱싱을 요청한다
- **THEN** 기존 데이터는 새 데이터로 대체되어 리뷰가 중복 적재되지 않는다

### Requirement: 리뷰 레코드 필드
시스템은 각 리뷰를 `id`, `rating`, `author`, `title`, `content` 필드로 보관해야 한다(SHALL). 검색 대상 텍스트는 제목과 내용을 합친 값이다.

#### Scenario: 필드 보존
- **WHEN** CSV의 한 행이 적재된다
- **THEN** 해당 행의 평점, 작성자, 제목, 내용이 검색 결과와 참고 리뷰에서 그대로 조회된다

### Requirement: 리뷰 id 보존
시스템은 CSV에 `id` 컬럼이 있고 값이 비어 있지 않으면 그 값을 리뷰의 `id`로 그대로 사용해야 한다(SHALL). 값이 비어 있거나 다른 행과 중복되면 적재 순서에 따라 고유한 id를 대신 부여한다.

#### Scenario: 원본 id 사용
- **WHEN** CSV 행의 `id`가 `r007`이다
- **THEN** 검색 결과와 참고 리뷰에서 해당 리뷰의 `id`는 `r007`이다

#### Scenario: id 컬럼 없음 또는 빈 값
- **WHEN** CSV에 `id` 컬럼이 없거나 해당 행의 `id`가 비어 있다
- **THEN** 적재 순서에 따른 고유한 id가 부여된다

#### Scenario: 중복 id
- **WHEN** 두 행이 같은 `id`를 가진다
- **THEN** 먼저 나온 행은 원본 id를 유지하고 뒤의 행에는 고유한 id가 부여되어 모든 id가 서로 다르다

### Requirement: CSV 오류 처리
시스템은 CSV 파일이 없거나 필수 컬럼이 없으면 적재하지 않고 `{ success: false, error }`를 반환해야 한다(SHALL). 내용이 비어 있는 행은 건너뛴다.

#### Scenario: 파일 없음
- **WHEN** `samples/review.csv`가 존재하지 않는 상태에서 인덱싱을 요청한다
- **THEN** 응답은 `success: false`이며 원인을 설명하는 `error` 문자열을 포함한다

#### Scenario: 빈 행 포함
- **WHEN** CSV에 제목과 내용이 모두 비어 있는 행이 있다
- **THEN** 해당 행은 적재 건수에 포함되지 않는다

### Requirement: Mock Mode 판별
시스템은 환경변수 `USE_MOCK`이 `'false'`가 아닌 모든 경우 Mock Mode로 동작해야 한다(MUST).

#### Scenario: 환경변수 미설정
- **WHEN** `USE_MOCK`이 설정되지 않은 상태로 서버가 동작한다
- **THEN** 로컬 CSV와 인메모리 스토어를 사용한다
