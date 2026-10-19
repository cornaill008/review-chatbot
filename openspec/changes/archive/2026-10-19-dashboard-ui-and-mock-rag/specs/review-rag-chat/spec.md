# Spec Delta

## Purpose

사용자 질문에 대해 인덱싱된 리뷰에서 관련 리뷰를 검색하고, 그 근거를 바탕으로 답변과 출처를 돌려주는 RAG 채팅 동작과 API 응답 규격을 정의한다.

## ADDED Requirements

### Requirement: 채팅 API 응답 규격
시스템은 `POST /api/chat`에 `{ message }`를 받아 성공 시 `{ success: true, answer, sources }`, 실패 시 `{ success: false, error }`를 반환해야 한다(SHALL).

#### Scenario: 정상 응답
- **WHEN** 인덱싱된 상태에서 유효한 질문을 보낸다
- **THEN** 응답은 `success: true`이며 비어 있지 않은 `answer`와 `sources` 배열을 포함한다

#### Scenario: 잘못된 요청
- **WHEN** `message`가 없거나 공백뿐인 요청을 보낸다
- **THEN** 응답은 `success: false`이며 `error`에 원인이 담긴다

### Requirement: 상위 5건 리뷰 검색
시스템은 질문을 토큰으로 나누어 리뷰 텍스트와의 매칭 점수를 계산하고, 점수가 0보다 큰 리뷰 중 점수 내림차순 상위 최대 5건을 검색 결과로 사용해야 한다(SHALL).

#### Scenario: 관련 리뷰 다수
- **WHEN** 질문과 매칭되는 리뷰가 5건보다 많다
- **THEN** 점수가 가장 높은 5건만 sources로 반환된다

#### Scenario: 관련 리뷰 없음
- **WHEN** 질문과 매칭되는 리뷰가 하나도 없다
- **THEN** sources는 빈 배열이며 answer는 관련 리뷰를 찾지 못했음을 안내한다

### Requirement: 근거 기반 답변 생성
시스템은 검색된 리뷰만을 근거로 한국어 답변을 생성해야 하며(SHALL), 리뷰에 없는 내용을 사실처럼 단정해서는 안 된다(MUST NOT).

#### Scenario: 근거 인용
- **WHEN** 검색 결과가 있는 질문에 답한다
- **THEN** 답변은 검색된 리뷰 내용에 기반하고 sources에 해당 리뷰가 포함된다

### Requirement: 출처 리뷰 구조
시스템은 각 source에 `id`, `rating`, `author`, `title`, `content`를 포함하고, 가능한 경우 검색 점수를 함께 반환해야 한다(SHALL).

#### Scenario: source 필드
- **WHEN** 응답에 sources가 포함된다
- **THEN** 각 항목은 평점, 작성자, 제목, 내용을 가진다

### Requirement: 인덱싱 전 질문 처리
시스템은 인덱싱되지 않은 상태의 채팅 요청에 대해 인덱싱이 먼저 필요하다는 오류를 반환해야 한다(SHALL).

#### Scenario: 미인덱싱 상태
- **WHEN** 인덱싱 없이 질문을 보낸다
- **THEN** 응답은 `success: false`이며 `error`가 인덱싱을 먼저 실행하라고 안내한다

### Requirement: 대화 히스토리 저장
시스템은 Mock Mode에서 사용자 질문과 어시스턴트 답변을 서버 인메모리에 순서대로 저장하고, 후속 질문의 답변 생성 시 최근 대화를 문맥으로 사용해야 한다(SHALL).

#### Scenario: 후속 질문
- **WHEN** 같은 세션에서 이전 답변을 가리키는 후속 질문을 보낸다
- **THEN** 이전 대화가 문맥으로 반영되어 답변이 생성된다

### Requirement: LLM 오류 처리
시스템은 API 키가 설정된 상태에서 LLM 호출이 실패해도 서버 오류로 중단되지 않고 `{ success: false, error }`를 반환해야 한다(SHALL). 오류 응답에는 LLM 서비스의 내부 오류 내용을 포함하지 않는다.

#### Scenario: LLM 호출 실패
- **WHEN** API 키가 설정되어 있고 LLM 호출이 실패한다
- **THEN** 응답은 `success: false`이며 일반화된 오류 문구만 `error`에 담기고, 해당 대화는 히스토리에 저장되지 않는다

### Requirement: API 키 없을 때 검색 결과 JSON 응답
시스템은 `ANTHROPIC_API_KEY`가 설정되지 않은 경우 답변 생성을 생략하고, 검색 결과를 담은 JSON 문자열을 `answer`로 하여 `success: true`로 응답해야 한다(SHALL). 이 JSON에는 질문, 검색 건수, 답변 생성이 생략되었다는 안내, 각 검색 결과의 순위·평점·작성자·제목·내용·점수가 포함된다. 이때 응답의 `sources`는 빈 배열이다.

#### Scenario: 키 없이 관련 질문
- **WHEN** `ANTHROPIC_API_KEY`가 없는 상태에서 검색 결과가 있는 질문을 보낸다
- **THEN** 응답은 `success: true`이고 `answer`는 파싱 가능한 JSON 문자열이며, 그 안의 검색 결과 건수는 1건 이상 5건 이하이고 `sources`는 빈 배열이다

#### Scenario: 키 없이 관련 리뷰 없음
- **WHEN** `ANTHROPIC_API_KEY`가 없는 상태에서 매칭되는 리뷰가 없는 질문을 보낸다
- **THEN** `answer`는 검색 건수가 0이고 결과 목록이 빈 JSON 문자열이다

#### Scenario: 키가 있으면 기존 동작
- **WHEN** `ANTHROPIC_API_KEY`가 설정되어 있다
- **THEN** 검색 결과를 근거로 LLM이 생성한 한국어 답변이 `answer`로 반환된다
