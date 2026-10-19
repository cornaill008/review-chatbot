# Design

## Context

동기와 범위는 proposal.md, 요구사항은 `specs/`를 따른다. 현재 상태:

- `src/lib/chain.ts`가 `ChatAnthropic`(`claude-haiku-4-5`, `temperature: 0.2`)으로 LCEL 체인을 만들고 `ANTHROPIC_API_KEY`로 키 유무를 판단한다. `/api/chat` 라우트는 `hasApiKey()`가 거짓이면 `generateAnswer`를 호출하지 않고 검색 결과 JSON을 돌려준다.
- 키 `KIMI_API_KEY`가 `.env.local`에 있다. 이 키로 직접 확인한 사실:
  - `https://api.moonshot.cn/v1/models` → 401, `https://api.moonshot.ai/v1/models` → 200. 사용 가능 모델: `kimi-k2.7-code-highspeed`, `kimi-k2.6`, `kimi-k2.7-code`, `kimi-k3`.
  - `kimi-k2.6`에 `temperature: 0.2`를 보내면 400(`only 1 is allowed for this model`).
  - 기본 호출은 추론 모델처럼 동작한다: 응답에 `reasoning_content`가 따로 오고, 짧은 질문에도 4~6초, completion 140~250토큰이 든다.
  - `thinking: { type: "disabled" }`를 보내면 같은 질문이 0.8초, 17토큰이다.
  - `max_tokens`와 `max_completion_tokens` 둘 다 허용된다.
- CLAUDE.md: LangChain.js는 프롬프트 조립·생성 전용, 임베딩 라이브러리 금지, 환경변수는 `process.env.*`로만 참조. LLM은 Kimi로 전환하기로 정했고 모델 ID·엔드포인트는 이 변경에서 확정해 기록한다.

## Goals / Non-Goals

**Goals:**
- 키가 있으면 Kimi가 검색된 리뷰만 근거로 한국어 답변을 만들고, 없으면 지금처럼 검색 결과 JSON을 보여준다.
- 인증 실패·시간 초과·호출 실패가 서버 오류나 무한 대기로 번지지 않는다.
- 모델·엔드포인트를 코드 수정 없이 바꿀 수 있다.

**Non-Goals:**
- Pinecone·Supabase(4단계), 스트리밍, 추론 모드 켜기, 사용량·비용 집계, Anthropic 병행 지원.

## Decisions

### 1. 라이브러리: `@langchain/openai`의 `ChatOpenAI` + `baseURL`
Kimi API는 OpenAI 호환이다. 기존 LCEL 체인과 `MessagesPlaceholder`를 그대로 쓰려고 LangChain 채팅 모델이 필요하고, `ChatOpenAI`에 `configuration: { baseURL }`을 주는 것이 표준 방식이다. 기존 `ChatModel` 타입(`Runnable<BasePromptValueInterface, BaseMessage>`)은 그대로 만족한다.
- CLAUDE.md 금지 사항("임베딩 라이브러리 추가 금지")과의 관계: 이 패키지에는 `OpenAIEmbeddings`도 들어 있지만 쓰지 않는다. 규칙의 취지(임베딩용 키가 없고 Pinecone 통합 임베딩을 쓴다)와 충돌하지 않음을 CLAUDE.md 2번 항목에 명시한다.
- 대안: `fetch`로 직접 호출하는 `RunnableLambda` → 의존성은 없지만 재시도·오류 변환·메시지 변환을 직접 구현해야 해 기각. `openai` SDK 직접 사용 → LCEL 체인과 어긋나서 기각.
- `@langchain/anthropic`은 더 이상 쓰지 않으므로 제거한다(병행 지원 없음).

### 2. 설정: 키는 필수, 모델·엔드포인트는 선택 환경변수
`KIMI_API_KEY`(필수, 공백뿐이면 없음), `KIMI_MODEL`(기본 `kimi-k2.6`), `KIMI_BASE_URL`(기본 `https://api.moonshot.ai/v1`). 모델 ID는 공급자가 자주 바꾸므로 코드 수정 없이 바꿀 수 있어야 하고, 지역(`.ai`/`.cn`)에 따라 키가 달라 엔드포인트도 바꿀 수 있어야 한다. 기본값은 키로 직접 확인한 값이다. `hasApiKey()`는 `KIMI_API_KEY`만 본다(이전 `ANTHROPIC_API_KEY`는 무시).
- 대안: 모델·엔드포인트를 상수로 고정 → 지역·모델 변경마다 코드 수정이 필요해 기각.

### 3. 매개변수: `temperature` 미지정, 추론 끔, 토큰 한도 2048
- `kimi-k2.6`은 `temperature`로 1만 허용하므로 지정하지 않는다. `ChatOpenAI`가 기본값을 대신 보내지 않는지 구현 후 실제 요청 본문으로 확인한다(테스트에서 `invocationParams`와 live 호출 둘 다).
- 추론은 `modelKwargs: { thinking: { type: "disabled" } }`로 끈다. 근거: 같은 질문에서 지연 4~6초 → 0.8초, completion 토큰 140~250 → 17. 이 앱의 일은 5건 리뷰의 인용·요약이라 깊은 추론이 필수가 아니고, 채팅 UX에서 지연이 더 큰 문제다. 품질이 부족하면 후속 변경에서 켜는 옵션을 검토한다.
- `maxTokens: 2048`: 추론을 끈 상태의 한국어 답변에는 넉넉하고, 이후 추론을 켜더라도 최종 답이 잘리지 않을 여유를 둔다.
- `timeout: 60000`, `maxRetries: 1`: 응답이 없을 때 최대 약 2분 안에 오류로 끝나게 한다. 재시도를 1회로 줄인 이유는 채팅에서 대기가 길어지는 것을 막기 위해서다.

### 4. 추론 내용 비노출
`ChatOpenAI`는 `reasoning_content`를 메시지 `content`가 아니라 별도 필드에 둔다. `StringOutputParser`는 `content`만 문자열로 바꾸므로 `answer`에는 최종 답변만 담긴다. 추론을 끈 기본 설정에서는 아예 오지 않지만, 설정이 바뀌어도 새지 않음을 테스트(가짜 모델이 `additional_kwargs.reasoning_content`를 함께 반환)로 고정한다.

### 4-1. 평문·간결 답변 지시 (실제 호출 검증에서 발견)
첫 실제 호출에서 답변이 900자 안팎의 마크다운(`##`, `**`, `>`, 표)이었고 질문당 16~17초가 걸렸다. 채팅 화면은 `whitespace-pre-wrap` 텍스트라 마크다운 기호가 그대로 보이고, 길이가 지연의 주된 원인이다(출력 토큰 수에 비례). 시스템 프롬프트에 "마크다운 서식을 쓰지 말고 평문으로, 대략 5~7문장 안으로 핵심만"을 추가한다. 기존 규칙(역할, 데이터 한정, 추측 금지, 장단점 균형, 작성자 인용, 한국어)은 그대로 둔다.
- 대안: 화면에 마크다운 렌더러 추가 → 의존성과 XSS 방어(리뷰 텍스트가 섞임)가 필요하고 지연은 그대로라 기각. 필요하면 후속 변경에서 검토한다.

### 5. 오류 처리
라우트의 기존 처리(`MissingApiKeyError`는 키 안내, 그 외는 일반화된 문구로 로그만 남김)를 그대로 쓴다. 인증 실패(401)와 시간 초과는 모두 "그 외"에 해당해 `success: false` + 일반화된 문구가 되고, 키 값이나 서비스 오류 본문은 응답과 로그의 `error` 객체 밖으로 나가지 않아야 한다. `MissingApiKeyError` 문구는 `KIMI_API_KEY`를 안내하도록 바꾼다.
- 로그에 남는 오류 객체에 요청 헤더(키)가 포함되지 않는지 구현 중 확인한다(`console.error`가 `Authorization`을 찍지 않는지).

### 6. 키 없을 때 폴백 유지
`GENERATION_SKIPPED_NOTE`의 키 이름만 `KIMI_API_KEY`로 바꾼다. 기존 동작(JSON 문자열을 `answer`, `sources`는 빈 배열)은 같다.

### 7. 문서
- CLAUDE.md: Generation 줄(`@langchain/openai`), LLM 줄(모델 `kimi-k2.6`, 엔드포인트, 선택 변수), 금지 사항 2번(채팅 모델용 `ChatOpenAI`는 허용, Embeddings는 금지), 4번(모델 ID 규칙을 Kimi 기준으로), 환경변수 목록(`KIMI_MODEL`, `KIMI_BASE_URL`).
- `.env.example`: 변수 이름과 빈 값만(Kimi, Pinecone, Supabase, `USE_MOCK`). 키 값은 적지 않는다.

## Risks / Trade-offs

- [질문과 검색된 리뷰 텍스트가 외부 서비스(Moonshot AI)로 전송됨] → 현재 데이터는 공개 샘플 리뷰다. 실데이터로 전환할 때는 개인정보 포함 여부를 다시 검토한다.
- [추론을 끄면 복잡한 질문의 답변 품질이 낮아질 수 있음] → 지연과 토큰을 크게 줄이는 대신의 선택이며, 실제 답변을 구현 후 직접 확인한다. 부족하면 후속 변경에서 옵션화.
- [`thinking` 매개변수는 공급자 확장이라 바뀔 수 있음] → 호출이 400이면 일반화된 오류로 처리되고 로그로 원인을 볼 수 있다. 이 매개변수를 한 곳(`createModel`)에 둔다.
- [`ChatOpenAI`가 `temperature` 등 기본값을 대신 보낼 가능성] → 단위 테스트와 live 호출로 실제 요청 본문을 확인한다.
- [국제/중국 엔드포인트에 따라 키가 달라짐] → 기본은 확인된 `.ai`, 다르면 `KIMI_BASE_URL`로 바꾼다. 인증 실패 시 일반화된 오류만 나가므로 원인 파악 방법(로그)을 문서에 적는다.
- [`@langchain/openai`에 `OpenAIEmbeddings`가 포함됨] → 사용하지 않음을 CLAUDE.md에 명시하고, 코드에서 `Embeddings`를 import하는 곳이 없음을 검증 태스크에 넣는다.
- [`.env.local`의 키가 채팅 기록에 노출됨] → 재발급을 권고한다. 코드·문서·테스트에는 키 값을 쓰지 않고 테스트는 가짜 값(`test-key`)을 쓴다.
