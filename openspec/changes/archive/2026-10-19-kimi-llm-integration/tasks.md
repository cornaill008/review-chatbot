# Tasks

## 1. 의존성과 설정 문서

- [x] 1.1 `@langchain/openai`를 설치하고 `@langchain/anthropic`을 제거한 뒤 `npm ls`에 `@langchain/anthropic`이 없는지, `npx tsc --noEmit`에서 `chain.ts` 외의 새 오류가 없는지 확인
- [x] 1.2 `.env.example`을 변수 이름과 빈 값만으로 갱신(`USE_MOCK`, `KIMI_API_KEY`, 선택 `KIMI_MODEL`·`KIMI_BASE_URL`, Pinecone 3개, Supabase 2개)하고, `grep`으로 파일에 키 값 패턴(`sk-`, `pcsk_`, `sb_publishable_`)이 없는지 확인

## 2. Kimi 호출 구성

- [x] 2.1 `src/lib/chain.ts`의 `hasApiKey`/`createModel`을 `KIMI_API_KEY`·`KIMI_MODEL`·`KIMI_BASE_URL` 기반 `ChatOpenAI`로 바꾸고(`temperature` 미지정, `thinking` 끔, `maxTokens` 2048, `timeout` 60초, `maxRetries` 1) `MissingApiKeyError` 문구를 `KIMI_API_KEY`로 바꾸며, 기본값·환경변수 변경·공백 값·`ANTHROPIC_API_KEY` 무시·`temperature` 미전송·`thinking` 전달·시간 제한 설정 단위 테스트가 통과하는지 확인
- [x] 2.2 추론 내용 비노출(가짜 모델이 `additional_kwargs.reasoning_content`를 함께 반환해도 `answer`에 없음)과 기존 체인 테스트(컨텍스트 형식, 프롬프트 규칙, 히스토리 6개 제한, `{}` 안전성, 0건이면 모델 미호출)가 통과하는지 확인
- [x] 2.3 `src/lib/retrieval-json.ts`의 안내 문구를 `KIMI_API_KEY` 기준으로 바꾸고, `route.test.ts`의 키 관련 테스트(`stubEnv` 대상 변수, 안내 문구, 공백 키, 이전 키 무시, 인증 실패·시간 초과 시 일반화된 오류와 미저장, 오류 로그에 키 값이 없음)를 갱신해 전체 테스트가 통과하는지 확인
- [x] 2.4 `chain.ts` 시스템 프롬프트에 "마크다운 서식을 쓰지 말고 평문으로, 대략 5~7문장 안으로 핵심만" 규칙을 추가하고(기존 규칙 유지), 프롬프트 규칙 단위 테스트가 통과하며 실제 호출에서 답변에 `##`·`**`·`>`·`|`가 없고 응답 시간이 줄었는지 확인(키 필요)

## 3. 문서

- [x] 3.1 `CLAUDE.md`의 Generation 줄·LLM 줄·금지 사항 2번(채팅 모델용 `ChatOpenAI` 허용, Embeddings 금지)·4번·환경변수 목록(`KIMI_MODEL`, `KIMI_BASE_URL` 포함)을 확정된 값(`kimi-k2.6`, `https://api.moonshot.ai/v1`)으로 갱신하고, 문서에 키 값이 없고 `Anthropic`·`ANTHROPIC` 언급이 남지 않았는지 `grep`으로 확인

## 4. 실제 호출 검증

- [x] 4.1 `.env.local`의 실제 키로 `/api/chat`을 `curl`해 `answer`가 비어 있지 않은 한국어 문장이고 `sources`가 1~5건이며 `answer`에 추론 내용이 없는지, 요청 본문에 `temperature`가 없는지 확인하고, 같은 `chatId`의 후속 질문이 이전 대화를 반영하는지 확인하며 실제 응답 시간을 기록(키 필요)
- [x] 4.2 잘못된 키(`KIMI_API_KEY=invalid`)로 띄운 별도 서버에서 `/api/chat`이 처리되지 않은 서버 오류가 아니라 `success: false`와 일반화된 문구를 돌려주고 응답과 서버 로그에 키 값이 없는지, 키가 비었을 때는 검색 결과 JSON이 나오는지 확인

## 5. 통합 확인

- [x] 5.1 `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`가 모두 통과하고 `Embeddings`를 import하는 코드가 없는지 `grep`으로 확인
- [x] 5.2 실제 Chrome에서 [샘플 데이터 인덱싱] → 질문 → Kimi 답변과 참고 리뷰 카드 → 후속 질문 흐름이 동작하고 대기 표시·카드가 정상인지 스크린샷으로 확인 (키 필요)

## Workflow follow-up

- 구현 후 `/opsx:archive`로 아카이브하면 main 스펙 `review-rag-chat`이 갱신된다(수정 2, 추가 2). 이 변경이 `mock-rag-pipeline`의 5.3과 `review-dashboard-ui`의 5.2(키가 필요한 종단 확인)를 사실상 함께 확인한다.
- 단위 작업별로 Conventional Commits 형식의 한국어 커밋 메시지로 커밋한다(커밋 시점은 사용자가 정한다).
