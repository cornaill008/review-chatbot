# Proposal

## Why

답변 생성에 쓰는 LLM을 Anthropic Claude에서 Kimi(Moonshot AI)로 바꾼다. 사용할 키가 `KIMI_API_KEY`로 제공되었고(`.env.local`에 저장됨), 현재 코드는 이 키를 읽지 않아 키가 있어도 항상 검색 결과 JSON만 나온다. 키로 직접 확인한 결과 이 키는 국제 엔드포인트 `https://api.moonshot.ai/v1`에서만 인증되고(중국 엔드포인트는 401), 사용 가능한 모델에 `kimi-k2.6`이 있다.

## What Changes

- 답변 생성을 Kimi로 교체한다. Kimi API는 OpenAI 호환이라 LangChain의 `ChatOpenAI`에 `baseURL`을 지정해 쓴다. 기존 LCEL 체인(`ChatPromptTemplate → 모델 → StringOutputParser`), 프롬프트, 히스토리 처리는 그대로 둔다.
- **BREAKING** 환경변수를 `ANTHROPIC_API_KEY`에서 `KIMI_API_KEY`로 바꾼다. 이전 변수는 더 이상 읽지 않는다.
- 모델과 엔드포인트는 선택 환경변수 `KIMI_MODEL`(기본 `kimi-k2.6`), `KIMI_BASE_URL`(기본 `https://api.moonshot.ai/v1`)로 바꿀 수 있다.
- `kimi-k2.6`의 제약에 맞춘다: `temperature`는 `1`만 허용되므로 보내지 않고, 추론(thinking)은 끈다(지연과 토큰 절감). 응답에는 최종 답변만 담고 추론 내용은 싣지 않는다.
- 호출 제한 시간(60초)과 재시도 1회를 둬 응답이 없을 때 대화가 멈춰 있지 않게 한다.
- 키가 없을 때의 검색 결과 JSON 폴백은 유지하되 안내 문구와 판단 기준을 `KIMI_API_KEY`로 바꾼다.
- 문서 갱신: `CLAUDE.md`의 LLM·생성 라이브러리·모델 규칙·환경변수 목록, `.env.example`(변수 이름만).
- 사용하지 않게 되는 `@langchain/anthropic`을 제거하고 `@langchain/openai`를 추가한다.

범위 밖: 4단계(Pinecone·Supabase) 연동, 스트리밍 응답, 모델 자동 선택, 추론 모드 켜기 옵션, 비용·사용량 집계.

## Capabilities

### New Capabilities
<!-- 새 capability 없음 -->

### Modified Capabilities
- `review-rag-chat`: "LLM 오류 처리"에 시간 초과 시나리오를 추가하고, "API 키 없을 때 검색 결과 JSON 응답"의 키를 `KIMI_API_KEY`로 바꾸며, "LLM 공급자 설정"과 "추론 과정 비노출" 요구사항을 추가한다.

## Impact

- 수정 코드: `src/lib/chain.ts`, `src/lib/retrieval-json.ts`, 관련 테스트(`chain.test.ts`, `route.test.ts`).
- 의존성: `@langchain/openai` 추가, `@langchain/anthropic` 제거. 임베딩 클래스(`OpenAIEmbeddings`)는 쓰지 않는다(CLAUDE.md 금지 사항의 취지: 임베딩 라이브러리 미사용).
- 문서: `CLAUDE.md`, `.env.example`.
- 외부 서비스: 질문과 검색된 샘플 리뷰 텍스트가 Moonshot AI(`api.moonshot.ai`)로 전송된다. 키 값은 코드·문서·커밋에 적지 않는다.
- 가정: 이 키의 지역은 국제(`.ai`)이고 모델은 `kimi-k2.6`이다(키로 `GET /v1/models`를 호출해 확인). 다른 지역 키로 바꾸면 `KIMI_BASE_URL`을 바꿔야 한다.
- 가정: 리뷰 요약·인용에는 깊은 추론이 필수는 아니므로 추론은 끈다. 답변 품질이 부족하면 후속 변경에서 켜는 옵션을 검토한다.
- 가정: 답변 지연이 줄어든 것은 확인했지만(추론 끔 0.8초 vs 켬 4~6초, 짧은 질문 기준), 실제 5건 컨텍스트·히스토리가 들어간 요청의 지연은 구현 후 직접 측정한다.
