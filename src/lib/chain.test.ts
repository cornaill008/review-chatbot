import http, { type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { BasePromptValueInterface } from "@langchain/core/prompt_values";
import { RunnableLambda } from "@langchain/core/runnables";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  HISTORY_LIMIT,
  MAX_TOKENS,
  MissingApiKeyError,
  NO_RESULT_ANSWER,
  REQUEST_TIMEOUT_MS,
  createModel,
  formatContext,
  generateAnswer,
  hasApiKey,
  type ChatModel,
} from "@/lib/chain";
import type { ChatMessage, SourceReview } from "@/lib/types";

const sources: SourceReview[] = [
  { id: "r1", rating: 5, author: "김민수", title: "배터리", content: "8시간 써요 {중괄호}", date: "2024-01-01", score: 0.98 },
  { id: "r2", rating: 3, author: "이서연", title: "배터리 아쉬움", content: "5시간밖에 안 가요", date: "2024-01-02", score: 0.8 },
];

function fakeModel(reply: string) {
  const captured: BaseMessage[][] = [];
  const model: ChatModel = RunnableLambda.from(async (value: BasePromptValueInterface) => {
    captured.push(value.toChatMessages());
    return new AIMessage(reply);
  });
  return { model, captured, factory: vi.fn(() => model) };
}

afterEach(() => vi.unstubAllEnvs());

describe("generateAnswer", () => {
  it("검색 결과가 0건이면 모델을 만들지도 호출하지도 않고 안내 문구를 반환한다", async () => {
    const { factory, captured } = fakeModel("호출되면 안 됨");

    const answer = await generateAnswer({ question: "배송은?", sources: [], history: [] }, factory);

    expect(answer).toBe(NO_RESULT_ANSWER);
    expect(factory).not.toHaveBeenCalled();
    expect(captured).toHaveLength(0);
  });

  it("검색된 리뷰를 [리뷰 N] 형식의 컨텍스트로 넣고 모델 답변을 반환한다", async () => {
    const { factory, captured } = fakeModel("  배터리는 약 8시간입니다 [리뷰 1]  ");

    const answer = await generateAnswer({ question: "배터리는 얼마나 가요?", sources, history: [] }, factory);

    expect(answer).toBe("배터리는 약 8시간입니다 [리뷰 1]");
    const [system, human] = captured[0];
    expect(system.content).toContain("[리뷰 1] ★5 배터리 — 8시간 써요 {중괄호} (작성자: 김민수)");
    expect(system.content).toContain("[리뷰 2] ★3 배터리 아쉬움 — 5시간밖에 안 가요 (작성자: 이서연)");
    expect(human.content).toBe("배터리는 얼마나 가요?");
  });

  it("시스템 프롬프트에 역할, 데이터 한정, 추측 금지, 장단점 균형, 작성자 인용, 한국어 규칙이 들어 있다", async () => {
    const { factory, captured } = fakeModel("답변");

    await generateAnswer({ question: "q", sources, history: [] }, factory);

    const system = String(captured[0][0].content);
    expect(system).toContain("당신은 전자제품 쇼핑몰의 전문 리뷰 분석가입니다.");
    expect(system).toContain("[실제 구매 고객 리뷰 데이터]만을 바탕으로");
    expect(system).toContain("리뷰에 없는 사실을 추측하여 지어내지 마세요.");
    expect(system).toContain("리뷰에서 확인되지 않습니다");
    expect(system).toContain("장점과 단점이 모두 존재한다면 균형 있게 설명하고, 관련 리뷰 작성자의 의견을 인용하세요.");
    expect(system).toContain("한국어");
    // 채팅 화면은 마크다운을 렌더링하지 않으므로 평문·간결 규칙이 있어야 한다
    expect(system).toContain("마크다운 서식을 쓰지 말고 평문으로 작성하세요");
    expect(system).toContain("5~7문장");
    // 컨텍스트는 데이터 구분 헤더 아래에 온다
    expect(system.indexOf("[실제 구매 고객 리뷰 데이터]\n[리뷰 1]")).toBeGreaterThan(-1);
  });

  it("이전 대화는 최근 6개만, 사용자 메시지부터 시작해 전달하고 중괄호도 안전하다", async () => {
    const { factory, captured } = fakeModel("답변");
    const history: ChatMessage[] = Array.from({ length: 8 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `m${i + 1} {x}`,
    }));

    await generateAnswer({ question: "후속 질문", sources, history }, factory);

    const messages = captured[0];
    // system + 이전 대화 6개 + 현재 질문
    expect(messages).toHaveLength(1 + HISTORY_LIMIT + 1);
    expect(messages.slice(1, -1).map((m) => m.content)).toEqual([
      "m3 {x}", "m4 {x}", "m5 {x}", "m6 {x}", "m7 {x}", "m8 {x}",
    ]);
    expect(messages[1].getType()).toBe("human");
  });

  it("모델 오류는 그대로 전파한다", async () => {
    const failing = () =>
      RunnableLambda.from(async (): Promise<BaseMessage> => {
        throw new Error("LLM 호출 실패");
      }) as ChatModel;

    await expect(generateAnswer({ question: "q", sources, history: [] }, failing)).rejects.toThrow("LLM 호출 실패");
  });
});

describe("formatContext", () => {
  it("한 리뷰를 한 줄로, 번호는 1부터 순서대로 만든다", () => {
    expect(formatContext(sources).split("\n")).toEqual([
      "[리뷰 1] ★5 배터리 — 8시간 써요 {중괄호} (작성자: 김민수)",
      "[리뷰 2] ★3 배터리 아쉬움 — 5시간밖에 안 가요 (작성자: 이서연)",
    ]);
  });

  it("검색 결과가 없으면 빈 문자열이다", () => {
    expect(formatContext([])).toBe("");
  });
});

/** 만들어진 ChatOpenAI의 실제 설정을 들여다보기 위한 최소 타입 */
interface InspectableModel {
  model: string;
  timeout: number;
  clientConfig: { baseURL: string };
  caller: { maxRetries: number };
  invocationParams(options?: object): Record<string, unknown>;
}

function stubKimiEnv(env: Record<string, string | undefined>) {
  for (const name of ["KIMI_API_KEY", "KIMI_MODEL", "KIMI_BASE_URL", "ANTHROPIC_API_KEY"]) {
    vi.stubEnv(name, env[name]);
  }
}

const inspect = () => createModel() as unknown as InspectableModel;

describe("hasApiKey", () => {
  it("KIMI_API_KEY가 있어야 true이고, 비어 있거나 공백뿐이면 false다", () => {
    stubKimiEnv({ KIMI_API_KEY: "test-key" });
    expect(hasApiKey()).toBe(true);
    stubKimiEnv({ KIMI_API_KEY: "" });
    expect(hasApiKey()).toBe(false);
    stubKimiEnv({ KIMI_API_KEY: "   " });
    expect(hasApiKey()).toBe(false);
    stubKimiEnv({});
    expect(hasApiKey()).toBe(false);
  });

  it("이전 ANTHROPIC_API_KEY만 있으면 키가 없는 것으로 본다", () => {
    stubKimiEnv({ ANTHROPIC_API_KEY: "old-claude-key" });

    expect(hasApiKey()).toBe(false);
  });
});

describe("createModel", () => {
  it("KIMI_API_KEY가 없으면 KIMI_API_KEY를 안내하는 MissingApiKeyError를 던진다", () => {
    stubKimiEnv({ KIMI_API_KEY: "" });

    expect(() => createModel()).toThrow(MissingApiKeyError);
    expect(() => createModel()).toThrow(/KIMI_API_KEY/);
  });

  it("ANTHROPIC_API_KEY만 있으면 모델을 만들지 않는다", () => {
    stubKimiEnv({ ANTHROPIC_API_KEY: "old-claude-key" });

    expect(() => createModel()).toThrow(MissingApiKeyError);
  });

  it("기본 설정: kimi-k2.6, 국제 엔드포인트, 토큰 한도 2048, 제한 시간 60초, 재시도 1회", () => {
    stubKimiEnv({ KIMI_API_KEY: "test-key" });

    const model = inspect();

    expect(DEFAULT_MODEL).toBe("kimi-k2.6");
    expect(DEFAULT_BASE_URL).toBe("https://api.moonshot.ai/v1");
    expect(model.model).toBe("kimi-k2.6");
    expect(model.clientConfig.baseURL).toBe("https://api.moonshot.ai/v1");
    expect(model.invocationParams()).toMatchObject({ model: "kimi-k2.6", max_tokens: MAX_TOKENS });
    expect(MAX_TOKENS).toBe(2048);
    expect(model.timeout).toBe(REQUEST_TIMEOUT_MS);
    expect(REQUEST_TIMEOUT_MS).toBe(60_000);
    expect(model.caller.maxRetries).toBe(1);
  });

  it("temperature를 보내지 않는다 (kimi-k2.6은 1만 허용한다). 실제 요청 본문 직렬화로 확인", () => {
    stubKimiEnv({ KIMI_API_KEY: "test-key" });

    const body = JSON.parse(JSON.stringify(inspect().invocationParams()));

    expect(body).not.toHaveProperty("temperature");
  });

  it("추론(thinking)을 끄도록 요청한다", () => {
    stubKimiEnv({ KIMI_API_KEY: "test-key" });

    expect(inspect().invocationParams()).toMatchObject({ thinking: { type: "disabled" } });
  });

  it("KIMI_MODEL과 KIMI_BASE_URL로 모델과 엔드포인트를 바꿀 수 있다", () => {
    stubKimiEnv({ KIMI_API_KEY: "test-key", KIMI_MODEL: "kimi-k3", KIMI_BASE_URL: "https://api.moonshot.cn/v1" });

    const model = inspect();

    expect(model.model).toBe("kimi-k3");
    expect(model.clientConfig.baseURL).toBe("https://api.moonshot.cn/v1");
  });

  it("KIMI_MODEL·KIMI_BASE_URL이 공백뿐이면 기본값을 쓴다", () => {
    stubKimiEnv({ KIMI_API_KEY: "test-key", KIMI_MODEL: "  ", KIMI_BASE_URL: "" });

    const model = inspect();

    expect(model.model).toBe(DEFAULT_MODEL);
    expect(model.clientConfig.baseURL).toBe(DEFAULT_BASE_URL);
  });

  it("엔드포인트 끝의 슬래시와 앞뒤 공백은 정리한다", () => {
    stubKimiEnv({ KIMI_API_KEY: "test-key", KIMI_MODEL: " kimi-k3 ", KIMI_BASE_URL: " https://example.test/v1/// " });

    const model = inspect();

    expect(model.model).toBe("kimi-k3");
    expect(model.clientConfig.baseURL).toBe("https://example.test/v1");
  });

  it("키 앞뒤 공백은 잘라서 쓴다", () => {
    stubKimiEnv({ KIMI_API_KEY: "  test-key  " });

    expect(() => createModel()).not.toThrow();
  });
});

describe("실제 HTTP 요청 (로컬 가짜 서버, 외부 호출 없음)", () => {
  interface Captured {
    url?: string;
    method?: string;
    headers: IncomingHttpHeaders;
    body: Record<string, unknown> & { messages: { role: string; content: string }[] };
  }

  /** OpenAI 호환 응답을 돌려주며 받은 요청을 기록하는 서버를 띄운다. */
  async function startFakeKimi(reply: object) {
    const requests: Captured[] = [];
    const server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        requests.push({ url: req.url, method: req.method, headers: req.headers, body: JSON.parse(raw) });
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(reply));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    return { requests, baseURL: `http://127.0.0.1:${port}/v1`, close: () => server.close() };
  }

  const completion = (message: object) => ({
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 0,
    model: "kimi-k2.6",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", ...message } }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });

  it("엔드포인트·인증 헤더·본문(temperature 없음, 추론 끔, 토큰 한도, 메시지 구성)을 확인하고 최종 답변만 돌려받는다", async () => {
    const fake = await startFakeKimi(completion({ content: "  최종 답변입니다  ", reasoning_content: "추론 과정입니다" }));
    stubKimiEnv({ KIMI_API_KEY: "test-key-123", KIMI_BASE_URL: `${fake.baseURL}/` });

    try {
      const answer = await generateAnswer({
        question: "배터리는 얼마나 가요?",
        sources,
        history: [
          { role: "user", content: "이전 질문" },
          { role: "assistant", content: "이전 답변" },
        ],
      });

      expect(answer).toBe("최종 답변입니다");
      expect(answer).not.toContain("추론");

      expect(fake.requests).toHaveLength(1);
      const [request] = fake.requests;
      expect(request.method).toBe("POST");
      expect(request.url).toBe("/v1/chat/completions");
      expect(request.headers.authorization).toBe("Bearer test-key-123");

      expect(request.body.model).toBe("kimi-k2.6");
      expect(request.body).not.toHaveProperty("temperature");
      expect(request.body.thinking).toEqual({ type: "disabled" });
      expect(request.body.max_tokens).toBe(2048);

      const roles = request.body.messages.map((m) => m.role);
      expect(roles).toEqual(["system", "user", "assistant", "user"]);
      expect(request.body.messages[0].content).toContain("[리뷰 1] ★5 배터리");
      expect(request.body.messages[1].content).toBe("이전 질문");
      expect(request.body.messages.at(-1)?.content).toBe("배터리는 얼마나 가요?");
    } finally {
      fake.close();
    }
  });

  it("KIMI_MODEL을 바꾸면 요청 본문의 model도 바뀐다", async () => {
    const fake = await startFakeKimi(completion({ content: "답" }));
    stubKimiEnv({ KIMI_API_KEY: "test-key", KIMI_MODEL: "kimi-k3", KIMI_BASE_URL: fake.baseURL });

    try {
      await generateAnswer({ question: "q", sources, history: [] });

      expect(fake.requests[0].body.model).toBe("kimi-k3");
    } finally {
      fake.close();
    }
  });
});

describe("추론 내용 비노출", () => {
  it("모델 응답에 reasoning_content가 함께 와도 answer에는 최종 답변만 담긴다", async () => {
    const withReasoning: ChatModel = RunnableLambda.from(
      async () =>
        new AIMessage({
          content: "  배터리는 약 8시간입니다.  ",
          additional_kwargs: { reasoning_content: "사용자는 배터리를 묻는다. 리뷰 1에 8시간이라고 있다. 따라서..." },
        }),
    );

    const answer = await generateAnswer({ question: "배터리는?", sources, history: [] }, () => withReasoning);

    expect(answer).toBe("배터리는 약 8시간입니다.");
    expect(answer).not.toContain("사용자는");
    expect(answer).not.toContain("따라서");
  });
});
