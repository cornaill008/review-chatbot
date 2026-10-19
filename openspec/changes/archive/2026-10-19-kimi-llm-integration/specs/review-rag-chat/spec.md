# Spec Delta

## MODIFIED Requirements

### Requirement: LLM 오류 처리
시스템은 API 키가 설정된 상태에서 LLM 호출이 실패하거나 제한 시간(60초) 안에 응답이 오지 않아도 서버 오류로 중단되지 않고 `{ success: false, error }`를 반환해야 한다(SHALL). 오류 응답에는 LLM 서비스의 내부 오류 내용을 포함하지 않는다.

#### Scenario: LLM 호출 실패
- **WHEN** API 키가 설정되어 있고 LLM 호출이 실패한다
- **THEN** 응답은 `success: false`이며 일반화된 오류 문구만 `error`에 담기고, 해당 대화는 히스토리에 저장되지 않는다

#### Scenario: 인증 실패
- **WHEN** 설정된 API 키가 LLM 서비스에서 거부된다
- **THEN** 응답은 `success: false`이며 키 값이나 서비스의 오류 본문 없이 일반화된 오류 문구만 담긴다

#### Scenario: 응답 시간 초과
- **WHEN** LLM 서비스가 제한 시간 안에 응답하지 않는다
- **THEN** 응답은 `success: false`이며 일반화된 오류 문구가 담기고 대화는 히스토리에 저장되지 않는다

### Requirement: API 키 없을 때 검색 결과 JSON 응답
시스템은 `KIMI_API_KEY`가 설정되지 않았거나 공백뿐인 경우 답변 생성을 생략하고, 검색 결과를 담은 JSON 문자열을 `answer`로 하여 `success: true`로 응답해야 한다(SHALL). 이 JSON에는 질문, 검색 건수, 답변 생성이 생략되었다는 안내, 각 검색 결과의 순위·id·평점·작성자·제목·내용·작성일·점수가 포함된다. 이때 응답의 `sources`는 빈 배열이다.

#### Scenario: 키 없이 관련 질문
- **WHEN** `KIMI_API_KEY`가 없는 상태에서 검색 결과가 있는 질문을 보낸다
- **THEN** 응답은 `success: true`이고 `answer`는 파싱 가능한 JSON 문자열이며, 그 안의 검색 결과 건수는 1건 이상 5건 이하이고 `sources`는 빈 배열이다

#### Scenario: 키 없이 관련 리뷰 없음
- **WHEN** `KIMI_API_KEY`가 없는 상태에서 매칭되는 리뷰가 없는 질문을 보낸다
- **THEN** JSON의 검색 결과는 빈 목록이 아니라 `helpful_votes` 내림차순 상위 5건이다

#### Scenario: 키가 있으면 기존 동작
- **WHEN** `KIMI_API_KEY`가 설정되어 있다
- **THEN** 검색 결과를 근거로 LLM이 생성한 한국어 답변이 `answer`로 반환되고 `sources`에 검색 결과가 담긴다

#### Scenario: 이전 키 변수는 무시
- **WHEN** `ANTHROPIC_API_KEY`만 설정되어 있고 `KIMI_API_KEY`는 없다
- **THEN** 키가 없는 것으로 취급되어 검색 결과 JSON이 응답된다

## ADDED Requirements

### Requirement: LLM 공급자 설정
시스템은 답변 생성에 Kimi(Moonshot AI)의 OpenAI 호환 API를 사용해야 한다(SHALL). API 키는 `KIMI_API_KEY`에서 읽고, 모델과 엔드포인트는 `KIMI_MODEL`(기본 `kimi-k2.6`)과 `KIMI_BASE_URL`(기본 `https://api.moonshot.ai/v1`)로 바꿀 수 있다. 이 값이 없거나 공백뿐이면 기본값을 쓴다.

#### Scenario: 기본 설정
- **WHEN** `KIMI_API_KEY`만 설정되어 있다
- **THEN** 모델 `kimi-k2.6`을 엔드포인트 `https://api.moonshot.ai/v1`로 호출한다

#### Scenario: 모델과 엔드포인트 변경
- **WHEN** `KIMI_MODEL`과 `KIMI_BASE_URL`이 설정되어 있다
- **THEN** 설정된 모델과 엔드포인트로 호출한다

#### Scenario: 공백 설정
- **WHEN** `KIMI_MODEL`이나 `KIMI_BASE_URL`이 공백뿐이다
- **THEN** 해당 값은 기본값으로 대체된다

#### Scenario: 허용되지 않는 매개변수
- **WHEN** 모델이 `temperature`로 1만 허용한다
- **THEN** 시스템은 `temperature`를 지정해 호출하지 않는다

### Requirement: 추론 과정 비노출
시스템은 `answer`에 모델의 최종 답변만 담아야 하며(SHALL), 모델이 내놓는 추론(reasoning) 내용을 응답에 포함해서는 안 된다(MUST NOT).

#### Scenario: 추론 내용이 함께 오는 응답
- **WHEN** 모델 응답에 최종 답변과 별도의 추론 내용이 함께 들어 있다
- **THEN** `answer`에는 최종 답변만 담기고 추론 내용은 담기지 않는다

### Requirement: 평문 답변 지시
시스템은 채팅 화면이 마크다운을 렌더링하지 않으므로, 답변 생성 지시에 마크다운 서식(제목, 굵게, 인용, 표 등)을 쓰지 말고 평문으로 핵심만 간결하게 답하라는 규칙을 포함해야 한다(SHALL).

#### Scenario: 답변 생성 지시
- **WHEN** 검색 결과가 있는 질문에 대한 답변을 생성한다
- **THEN** 모델에 전달되는 지시에 마크다운 서식을 쓰지 말고 평문으로 간결하게 답하라는 규칙이 포함된다

#### Scenario: 기존 답변 규칙 유지
- **WHEN** 답변 생성 지시가 만들어진다
- **THEN** 리뷰에 없는 사실을 지어내지 않기, 장점과 단점의 균형, 작성자 의견 인용, 한국어 작성 규칙은 그대로 포함된다
