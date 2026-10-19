# Spec Delta

## MODIFIED Requirements

### Requirement: 채팅 API 응답 규격
시스템은 `POST /api/chat`에 `{ query, chatId? }`를 받아 성공 시 `{ success: true, mode, answer, sources }`, 실패 시 `{ success: false, error }`를 반환해야 한다(SHALL). `query`는 비어 있지 않은 문자열이고 `chatId`는 선택 문자열이다. 이전의 `message` 필드는 더 이상 받지 않는다.

#### Scenario: 정상 응답
- **WHEN** 인덱싱된 상태에서 유효한 `query`를 보낸다
- **THEN** 응답은 `success: true`, `mode: 'mock'`이며 비어 있지 않은 `answer`와 `sources` 배열을 포함한다

#### Scenario: 잘못된 요청
- **WHEN** `query`가 없거나 공백뿐이거나 문자열이 아닌 요청을 보낸다
- **THEN** 응답은 `success: false`이며 `error`에 원인이 담긴다

#### Scenario: chatId 생략
- **WHEN** `chatId` 없이 유효한 `query`를 보낸다
- **THEN** 요청은 정상 처리된다

#### Scenario: 잘못된 chatId
- **WHEN** `chatId`가 문자열이 아니거나 100자를 넘는다
- **THEN** 응답은 `success: false`이며 `error`에 원인이 담긴다

#### Scenario: 이전 요청 형식
- **WHEN** `query` 없이 `message`만 담은 요청을 보낸다
- **THEN** 응답은 `success: false`이다

### Requirement: 상위 5건 리뷰 검색
시스템은 질문에서 2글자 이상의 키워드를 추출해 각 리뷰의 제목과 내용에 포함된 횟수를 세고, 이 횟수와 `helpful_votes`를 조합한 점수로 점수 내림차순 상위 최대 5건을 검색 결과로 사용해야 한다(SHALL). 점수가 같으면 CSV의 원래 순서를 따른다.

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

### Requirement: 근거 기반 답변 생성
시스템은 검색된 리뷰만을 근거로 한국어 답변을 생성해야 하며(SHALL), 리뷰에 없는 내용을 사실처럼 단정해서는 안 된다(MUST NOT). 장점과 단점이 모두 있으면 균형 있게 설명하고, 관련 리뷰 작성자의 의견을 인용한다.

#### Scenario: 근거 인용
- **WHEN** 검색 결과가 있는 질문에 답한다
- **THEN** 답변은 검색된 리뷰 내용에 기반하고 sources에 해당 리뷰가 포함된다

#### Scenario: 근거 부족
- **WHEN** 검색된 리뷰에 질문에 대한 정보가 없다
- **THEN** 답변은 리뷰에서 확인되지 않는다고 말하고 내용을 추측해 지어내지 않는다

#### Scenario: 장단점 균형
- **WHEN** 검색된 리뷰에 긍정 의견과 부정 의견이 함께 있다
- **THEN** 답변 생성 지시에는 장점과 단점을 모두 설명하고 작성자 의견을 인용하라는 규칙이 포함된다

### Requirement: 출처 리뷰 구조
시스템은 각 source에 `id`, `title`, `content`, `rating`, `author`, `date`, `score`를 포함해야 한다(SHALL).

#### Scenario: source 필드
- **WHEN** 응답에 sources가 포함된다
- **THEN** 각 항목은 id, 제목, 내용, 평점, 작성자, 작성일, 점수를 가진다

### Requirement: 대화 히스토리 저장
시스템은 Mock Mode에서 사용자 질문과 어시스턴트 답변을 `chatId`별로 서버 인메모리에 순서대로 저장하고, 후속 질문의 답변 생성 시 같은 `chatId`의 최근 대화를 문맥으로 사용해야 한다(SHALL). `chatId`를 생략한 요청은 하나의 기본 대화를 공유한다.

#### Scenario: 후속 질문
- **WHEN** 같은 `chatId`로 이전 답변을 가리키는 후속 질문을 보낸다
- **THEN** 이전 대화가 문맥으로 반영되어 답변이 생성된다

#### Scenario: 대화 분리
- **WHEN** 서로 다른 `chatId`로 질문을 보낸다
- **THEN** 한 대화의 질문과 답변은 다른 대화의 문맥에 포함되지 않는다

#### Scenario: 실패한 요청은 저장하지 않음
- **WHEN** 답변 생성이 실패한다
- **THEN** 해당 질문과 오류는 대화 히스토리에 저장되지 않는다

### Requirement: API 키 없을 때 검색 결과 JSON 응답
시스템은 `ANTHROPIC_API_KEY`가 설정되지 않은 경우 답변 생성을 생략하고, 검색 결과를 담은 JSON 문자열을 `answer`로 하여 `success: true`로 응답해야 한다(SHALL). 이 JSON에는 질문, 검색 건수, 답변 생성이 생략되었다는 안내, 각 검색 결과의 순위·id·평점·작성자·제목·내용·작성일·점수가 포함된다. 이때 응답의 `sources`는 빈 배열이다.

#### Scenario: 키 없이 관련 질문
- **WHEN** `ANTHROPIC_API_KEY`가 없는 상태에서 검색 결과가 있는 질문을 보낸다
- **THEN** 응답은 `success: true`이고 `answer`는 파싱 가능한 JSON 문자열이며, 그 안의 검색 결과 건수는 1건 이상 5건 이하이고 `sources`는 빈 배열이다

#### Scenario: 키 없이 관련 리뷰 없음
- **WHEN** `ANTHROPIC_API_KEY`가 없는 상태에서 매칭되는 리뷰가 없는 질문을 보낸다
- **THEN** JSON의 검색 결과는 빈 목록이 아니라 `helpful_votes` 내림차순 상위 5건이다

#### Scenario: 키가 있으면 기존 동작
- **WHEN** `ANTHROPIC_API_KEY`가 설정되어 있다
- **THEN** 검색 결과를 근거로 LLM이 생성한 한국어 답변이 `answer`로 반환된다

## ADDED Requirements

### Requirement: 검색 점수 범위
시스템은 모든 검색 결과의 `score`를 0.65 이상 0.98 이하의 숫자로 소수 둘째 자리까지 반올림해 반환해야 한다(SHALL). 같은 응답 안에서는 키워드 포함 횟수와 `helpful_votes`가 클수록 점수가 같거나 높고, 결과는 점수 내림차순으로 정렬된다.

#### Scenario: 점수 범위
- **WHEN** 검색 결과가 반환된다
- **THEN** 모든 `score`는 0.65 이상 0.98 이하이다

#### Scenario: 점수 정렬
- **WHEN** 검색 결과가 2건 이상이다
- **THEN** `score`는 앞에서 뒤로 갈수록 같거나 작아진다

#### Scenario: 단일 결과
- **WHEN** 검색 결과가 1건이다
- **THEN** 그 결과의 `score`도 0.65 이상 0.98 이하이다

### Requirement: 매칭 없을 때 인기 리뷰 기본 반환
시스템은 질문에서 추출한 키워드와 매칭되는 리뷰가 하나도 없거나 추출된 키워드가 없으면, 빈 결과 대신 `helpful_votes`가 가장 큰 상위 5건을 검색 결과로 사용해야 한다(SHALL). `helpful_votes`가 같으면 CSV의 원래 순서를 따른다.

#### Scenario: 매칭 키워드 없음
- **WHEN** 질문의 키워드가 어떤 리뷰의 제목이나 내용에도 없다
- **THEN** sources는 `helpful_votes` 내림차순 상위 5건이다

#### Scenario: 키워드 자체가 없는 질문
- **WHEN** 질문이 `?`처럼 키워드를 추출할 수 없는 입력이다
- **THEN** sources는 `helpful_votes` 내림차순 상위 5건이다

#### Scenario: 리뷰가 5건 미만
- **WHEN** 인덱싱된 리뷰가 3건뿐이고 매칭 키워드가 없다
- **THEN** sources는 3건 모두를 `helpful_votes` 내림차순으로 반환한다
