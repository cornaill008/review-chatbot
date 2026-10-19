# Spec Delta

## Purpose

`USE_MOCK=false`에서 리뷰를 Pinecone 통합 임베딩 인덱스로 검색하고, 리뷰 원본과 대화 기록을 Supabase에 영속화하는 실데이터 모드의 인덱싱·검색·저장·상태 조회·오류 처리를 정의한다.

## ADDED Requirements

### Requirement: 실데이터 모드 전환
시스템은 환경변수 `USE_MOCK`이 정확히 `'false'`일 때만 실데이터 모드로 동작해야 한다(SHALL). 이 모드에서 `POST /api/index-data`, `POST /api/chat`, `GET /api/status`의 성공 응답은 `mode: 'real'`을 담고, 요청·응답 형식은 Mock 모드와 같다.

#### Scenario: 실데이터 모드 응답
- **WHEN** `USE_MOCK`이 `'false'`인 상태에서 각 API가 성공한다
- **THEN** 응답의 `mode`는 `'real'`이다

#### Scenario: 그 외 값은 Mock 모드
- **WHEN** `USE_MOCK`이 설정되지 않았거나 `'true'`이거나 빈 문자열이다
- **THEN** 기존 Mock 모드로 동작하고 Pinecone과 Supabase에 요청하지 않는다

### Requirement: 필수 설정 검증
시스템은 실데이터 모드에서 `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `NEXT_PUBLIC_SUPABASE_URL`, Supabase 공개 키 중 하나라도 없거나 공백뿐이면 외부 요청 없이 `{ success: false, error }`를 반환해야 한다(SHALL). 오류에는 빠진 변수의 이름만 담고 값은 담지 않는다. `PINECONE_HOST`는 선택이며 없거나 예시 값(`xxxx` 포함)이면 인덱스 이름으로 호스트를 찾는다.

#### Scenario: 설정 누락
- **WHEN** 실데이터 모드에서 `PINECONE_API_KEY`가 없다
- **THEN** 응답은 `success: false`이고 `error`에 `PINECONE_API_KEY`가 빠졌다는 안내가 있으며 키 값은 없다

#### Scenario: 호스트 생략
- **WHEN** `PINECONE_HOST`가 비어 있거나 `xxxx`가 들어간 예시 값이다
- **THEN** 설정 오류 없이 인덱스 이름으로 호스트를 찾아 동작한다

#### Scenario: Supabase 키 이름
- **WHEN** `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 중 여러 개가 설정되어 있다
- **THEN** 앞의 것부터 비어 있지 않은 첫 값을 쓴다

### Requirement: 실데이터 인덱싱
시스템은 실데이터 모드의 `POST /api/index-data`에서 `samples/review.csv`의 유효한 모든 행을 Supabase `reviews` 테이블에 `id` 기준으로 upsert하고 Pinecone에 적재한 뒤 `{ success: true, mode: 'real', data: { indexed } }`를 반환해야 한다(SHALL). `indexed`는 적재한 리뷰 건수다.

#### Scenario: 100건 인덱싱
- **WHEN** 유효한 행이 100개인 CSV로 실데이터 모드에서 인덱싱한다
- **THEN** Supabase `reviews`에 100행, Pinecone 네임스페이스 `reviews`에 100개 레코드가 있고 `data.indexed`는 100이다

#### Scenario: 리뷰 필드 저장
- **WHEN** CSV의 한 행이 적재된다
- **THEN** Supabase 행에는 id, 평점, 제목, 내용, 작성자, 작성일, `helpful_votes`, `verified_purchase`가 CSV 값 그대로(타입 변환 포함) 저장된다

#### Scenario: CSV 오류
- **WHEN** CSV 파일이 없거나 필수 컬럼이 없다
- **THEN** Pinecone과 Supabase에는 아무것도 쓰지 않고 Mock 모드와 같은 오류 응답을 돌려준다

### Requirement: 통합 임베딩 레코드 적재
시스템은 리뷰를 임베딩 벡터가 아니라 텍스트로 Pinecone에 전달해야 한다(SHALL). 각 레코드는 `_id`(리뷰 id), `text`(제목과 내용을 공백으로 이은 값), `rating`, `author`, `title`, `content`로 구성하고, 네임스페이스 `reviews`에 한 번에 96개 이하씩 순차로 적재한다.

#### Scenario: 레코드 형태
- **WHEN** 리뷰 `r007`이 적재된다
- **THEN** 레코드의 `_id`는 `r007`, `text`는 `"{제목} {내용}"`이고 평점은 숫자이며 벡터 값은 포함되지 않는다

#### Scenario: 96개 이하 배치
- **WHEN** 리뷰가 100건이다
- **THEN** 적재 요청은 96건과 4건의 두 배치로 순차 전송되고 각 배치는 96건을 넘지 않는다

### Requirement: 재인덱싱과 삭제 반영
시스템은 이미 인덱싱된 상태에서 다시 인덱싱해도 같은 `id`의 리뷰를 중복 저장하지 않아야 하며(SHALL), CSV에서 사라진 `id`는 Supabase와 Pinecone 양쪽에서 제거해 CSV와 같은 집합이 되게 해야 한다.

#### Scenario: 같은 CSV 재인덱싱
- **WHEN** 같은 CSV로 두 번 인덱싱한다
- **THEN** Supabase와 Pinecone의 건수는 CSV 행 수와 같고 중복이 없다

#### Scenario: 줄어든 CSV
- **WHEN** 이전에 100건이던 CSV에서 3건이 삭제된 뒤 다시 인덱싱한다
- **THEN** 두 저장소 모두 97건이 되고 삭제된 3건은 검색에도 나오지 않는다

### Requirement: 인덱싱 반영 대기
시스템은 Pinecone이 적재 직후 검색에 바로 반영하지 않을 수 있으므로, 적재 후 네임스페이스의 레코드 수가 적재 건수에 도달할 때까지 제한 시간(30초) 안에서 기다린 뒤 응답해야 한다(SHALL). 제한 시간이 지나도 적재 자체가 성공했으면 성공으로 응답한다.

#### Scenario: 인덱싱 직후 질문
- **WHEN** 인덱싱 응답을 받은 직후 질문한다
- **THEN** 적재한 리뷰가 검색 대상에 포함된다

#### Scenario: 반영 대기 시간 초과
- **WHEN** 30초가 지나도 레코드 수가 적재 건수에 도달하지 않는다
- **THEN** 적재가 성공했다면 응답은 `success: true`이다

### Requirement: 실데이터 검색
시스템은 실데이터 모드의 `POST /api/chat`에서 질문 텍스트를 Pinecone에 그대로 전달해 상위 5건을 검색하고, 각 결과를 `{ id, title, content, rating, author, date, score }`로 구성해야 한다(SHALL). 제목·내용·평점·작성자는 검색 결과의 필드를, 작성일은 Supabase `reviews`의 같은 `id` 행을 쓰며, 결과 순서는 Pinecone의 순위를 따른다.

#### Scenario: 검색 요청
- **WHEN** 인덱싱된 상태에서 질문한다
- **THEN** Pinecone에는 질문 텍스트와 `topK` 5가 전달되고 sources는 최대 5건이다

#### Scenario: 작성일 보강
- **WHEN** 검색 결과의 id가 Supabase `reviews`에 있다
- **THEN** 해당 source의 `date`에 그 행의 작성일이 담긴다

#### Scenario: 작성일 조회 실패
- **WHEN** Supabase에서 작성일을 가져오지 못한다
- **THEN** 해당 source의 `date`는 빈 문자열이고 답변 생성은 계속된다

#### Scenario: 검색 결과 없음
- **WHEN** Pinecone이 결과를 하나도 돌려주지 않는다
- **THEN** sources는 빈 배열이고 답변은 관련 리뷰를 찾지 못했음을 안내한다

### Requirement: 실데이터 검색 점수
시스템은 실데이터 모드의 각 source `score`를 Pinecone의 유사도 점수를 0~1로 제한한 뒤 `0.65 + 0.33 × 점수`로 바꾸고 소수 둘째 자리까지 반올림해 0.65 이상 0.98 이하로 만들어야 한다(SHALL). 순서는 Pinecone의 순위를 유지하므로 점수는 앞에서 뒤로 갈수록 같거나 작아진다.

#### Scenario: 점수 매핑
- **WHEN** Pinecone 점수가 0.5이다
- **THEN** `score`는 0.82이다

#### Scenario: 범위 밖 점수
- **WHEN** Pinecone 점수가 1.3이거나 -0.2이다
- **THEN** `score`는 각각 0.98, 0.65이다

### Requirement: 대화 기록 영속화
시스템은 실데이터 모드에서 답변 생성에 성공했을 때만 사용자 질문과 어시스턴트 답변을 Supabase `messages`에 저장해야 한다(SHALL). 각 행은 `chat_id`(`chatId`를 생략하면 `default`), `role`, `content`를 담고 어시스턴트 행에는 `sources`도 담는다. 후속 질문의 문맥은 같은 `chat_id`의 최근 메시지 6개를 시간순으로 읽어 쓴다.

#### Scenario: 질문과 답변 저장
- **WHEN** 실데이터 모드에서 질문에 성공적으로 답한다
- **THEN** `messages`에 같은 `chat_id`로 `user` 행과 `assistant` 행이 순서대로 저장되고 `assistant` 행의 `sources`에 근거 리뷰가 담긴다

#### Scenario: 재시작 후에도 문맥 유지
- **WHEN** 서버를 재시작한 뒤 같은 `chatId`로 후속 질문을 한다
- **THEN** 재시작 전의 대화가 문맥으로 반영된다

#### Scenario: 대화 분리
- **WHEN** 서로 다른 `chatId`로 질문한다
- **THEN** 한 대화의 메시지는 다른 대화의 문맥에 포함되지 않는다

#### Scenario: 실패한 요청은 저장하지 않음
- **WHEN** 답변 생성이 실패한다
- **THEN** 해당 질문과 오류는 `messages`에 저장되지 않는다

### Requirement: 실데이터 상태 조회
시스템은 실데이터 모드의 `GET /api/status`에서 `mode: 'real'`, Supabase `reviews`의 행 수를 `count`로, `count`가 0보다 크고 Pinecone 네임스페이스에도 레코드가 있을 때만 `indexed: true`로 반환해야 한다(SHALL).

#### Scenario: 인덱싱 전
- **WHEN** Supabase와 Pinecone이 모두 비어 있다
- **THEN** `indexed`는 `false`이고 `count`는 0이다

#### Scenario: 인덱싱 후
- **WHEN** 100건이 두 저장소에 적재되어 있다
- **THEN** `indexed`는 `true`이고 `count`는 100이다

#### Scenario: 한쪽만 적재된 상태
- **WHEN** Supabase에는 행이 있지만 Pinecone 네임스페이스는 비어 있다
- **THEN** `indexed`는 `false`이다

### Requirement: 외부 서비스 오류 처리
시스템은 Pinecone 또는 Supabase 호출이 실패해도 서버 오류로 중단되지 않고 `{ success: false, error }`를 반환해야 한다(SHALL). 오류 응답에는 일반화된 문구만 담고, 키 값이나 서비스의 오류 본문을 응답과 서버 로그에 남기지 않는다.

#### Scenario: Pinecone 실패
- **WHEN** 검색이나 적재 중 Pinecone 요청이 실패한다
- **THEN** 응답은 `success: false`이며 일반화된 문구만 담기고 대화는 저장되지 않는다

#### Scenario: Supabase 실패
- **WHEN** 리뷰 저장이나 대화 저장 중 Supabase 요청이 실패한다
- **THEN** 응답은 `success: false`이며 일반화된 문구만 담긴다

#### Scenario: 비밀 값 비노출
- **WHEN** 외부 서비스 오류 메시지에 키 값이 포함되어 있다
- **THEN** 응답과 서버 로그에는 키 값이 나타나지 않는다

### Requirement: 인덱싱 부분 실패 처리
시스템은 인덱싱 도중 Supabase나 Pinecone 단계가 실패하면 `success: false`를 반환해야 하며(SHALL), 그때까지 쓴 데이터를 되돌리지 않는다. 같은 CSV로 다시 인덱싱하면 두 저장소가 일치하는 상태로 복구된다.

#### Scenario: Pinecone 적재 실패
- **WHEN** Supabase 저장은 끝났고 Pinecone 적재가 실패한다
- **THEN** 응답은 `success: false`이고 `GET /api/status`의 `indexed`는 `false`다

#### Scenario: 재시도로 복구
- **WHEN** 실패 후 다시 인덱싱해 성공한다
- **THEN** 두 저장소의 건수가 같고 `indexed`는 `true`다
