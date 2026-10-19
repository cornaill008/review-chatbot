# Spec Delta

## MODIFIED Requirements

### Requirement: 상위 5건 리뷰 검색
시스템은 Mock Mode에서 질문에서 2글자 이상의 키워드를 추출해 각 리뷰의 제목과 내용에 포함된 횟수를 세고, 이 횟수와 `helpful_votes`를 조합한 점수로 점수 내림차순 상위 최대 5건을 검색 결과로 사용해야 한다(SHALL). 점수가 같으면 CSV의 원래 순서를 따른다. 실데이터 모드의 검색은 `real-data-mode` 스펙을 따른다.

#### Scenario: 관련 리뷰 다수
- **WHEN** 질문과 매칭되는 리뷰가 5건보다 많다
- **THEN** 점수가 가장 높은 5건만 sources로 반환된다

#### Scenario: 관련 리뷰 없음
- **WHEN** 질문과 매칭되는 리뷰가 하나도 없다
- **THEN** 빈 결과 대신 `helpful_votes` 내림차순 상위 5건이 sources로 반환된다(자세한 규칙은 "매칭 없을 때 인기 리뷰 기본 반환")

#### Scenario: 제목 매칭 우선
- **WHEN** 키워드가 한 리뷰에서는 제목에, 다른 리뷰에서는 내용에만 한 번씩 나타나고 두 리뷰의 `helpful_votes`가 같다
- **THEN** 제목에 나타난 리뷰가 더 높은 점수를 받는다

#### Scenario: 도움이 됨 수 반영
- **WHEN** 키워드 포함 횟수가 같은 두 리뷰의 `helpful_votes`가 각각 30과 3이다
- **THEN** `helpful_votes`가 30인 리뷰가 더 높은 점수를 받아 먼저 나온다

#### Scenario: 짧은 키워드 제외
- **WHEN** 질문이 1글자 단어만으로 이루어져 있다
- **THEN** 추출되는 키워드가 없는 것으로 처리된다

### Requirement: 매칭 없을 때 인기 리뷰 기본 반환
시스템은 Mock Mode에서 질문에서 추출한 키워드와 매칭되는 리뷰가 하나도 없거나 추출된 키워드가 없으면, 빈 결과 대신 `helpful_votes`가 가장 큰 상위 5건을 검색 결과로 사용해야 한다(SHALL). `helpful_votes`가 같으면 CSV의 원래 순서를 따른다. 실데이터 모드는 의미 기반 검색이라 이 규칙을 적용하지 않는다.

#### Scenario: 매칭 키워드 없음
- **WHEN** 질문의 키워드가 어떤 리뷰의 제목이나 내용에도 없다
- **THEN** sources는 `helpful_votes` 내림차순 상위 5건이다

#### Scenario: 키워드 자체가 없는 질문
- **WHEN** 질문이 `?`처럼 키워드를 추출할 수 없는 입력이다
- **THEN** sources는 `helpful_votes` 내림차순 상위 5건이다

#### Scenario: 리뷰가 5건 미만
- **WHEN** 인덱싱된 리뷰가 3건뿐이고 매칭 키워드가 없다
- **THEN** sources는 3건 모두를 `helpful_votes` 내림차순으로 반환한다

### Requirement: 대화 히스토리 저장
시스템은 사용자 질문과 어시스턴트 답변을 `chatId`별로 순서대로 저장하고, 후속 질문의 답변 생성 시 같은 `chatId`의 최근 대화를 문맥으로 사용해야 한다(SHALL). 저장 위치는 Mock Mode에서는 서버 인메모리, 실데이터 모드에서는 Supabase `messages` 테이블이다. `chatId`를 생략한 요청은 하나의 기본 대화를 공유한다.

#### Scenario: 후속 질문
- **WHEN** 같은 `chatId`로 이전 답변을 가리키는 후속 질문을 보낸다
- **THEN** 이전 대화가 문맥으로 반영되어 답변이 생성된다

#### Scenario: 대화 분리
- **WHEN** 서로 다른 `chatId`로 질문을 보낸다
- **THEN** 한 대화의 질문과 답변은 다른 대화의 문맥에 포함되지 않는다

#### Scenario: 실패한 요청은 저장하지 않음
- **WHEN** 답변 생성이 실패한다
- **THEN** 해당 질문과 오류는 대화 히스토리에 저장되지 않는다
