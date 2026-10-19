import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { BasePromptValueInterface } from "@langchain/core/prompt_values";
import { RunnableLambda } from "@langchain/core/runnables";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HISTORY_LIMIT,
  MODEL_ID,
  MissingApiKeyError,
  NO_RESULT_ANSWER,
  createModel,
  formatContext,
  generateAnswer,
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

describe("createModel", () => {
  it("ANTHROPIC_API_KEY가 없으면 MissingApiKeyError를 던진다", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => createModel()).toThrow(MissingApiKeyError);
  });

  it("키가 있으면 날짜 suffix 없는 claude-haiku-4-5 모델을 만든다", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const model = createModel() as unknown as { model: string };
    expect(MODEL_ID).toBe("claude-haiku-4-5");
    expect(model.model).toBe("claude-haiku-4-5");
  });
});
