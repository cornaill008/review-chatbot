import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chain")>();
  return { ...actual, generateAnswer: vi.fn() };
});

import { POST } from "@/app/api/chat/route";
import { MissingApiKeyError, generateAnswer } from "@/lib/chain";
import { MockReviewRepository } from "@/lib/repository/mock";
import { getMockMessages, resetMockStore } from "@/lib/review-store";
import type { ChatResponse, Review } from "@/lib/types";

const review = (n: number, title: string, content: string, helpfulVotes: number): Review => ({
  id: `r${n}`,
  rating: 4,
  author: `작성자${n}`,
  title,
  content,
  date: `2024-01-0${n}`,
  helpfulVotes,
});

// r1·r2만 "배터리"와 매칭된다. 나머지는 무관하며 helpful_votes는 r7 > r6 > r5 > r4 > r3 순이다.
const fixture: Review[] = [
  review(1, "배터리", "8시간 써요", 3),
  review(2, "음질", "배터리 보통이에요", 9),
  review(3, "착용감", "편해요", 1),
  review(4, "디자인", "예뻐요", 4),
  review(5, "가격", "합리적이에요", 20),
  review(6, "배송", "빨라요", 30),
  review(7, "케이스", "작아요", 50),
];

const generate = vi.mocked(generateAnswer);

function post(body: unknown, raw = false) {
  return POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      body: raw ? (body as string) : JSON.stringify(body),
    }),
  );
}

async function json(res: Response) {
  return (await res.json()) as ChatResponse;
}

beforeEach(async () => {
  resetMockStore();
  generate.mockReset();
  generate.mockResolvedValue("답변");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key"); // 기본은 키가 있는 상황
  vi.stubEnv("USE_MOCK", undefined);
  await new MockReviewRepository(async () => fixture).index();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("요청 검증", () => {
  it("query가 없거나 공백이거나 문자열이 아니거나 JSON이 아니면 400과 success:false", async () => {
    const responses = [
      await post({}),
      await post({ query: "   " }),
      await post({ query: 1 }),
      await post({ query: null }),
      await post("not json", true),
      await post("null", true),
    ];

    for (const res of responses) {
      expect(res.status).toBe(400);
      expect(await json(res)).toEqual({ success: false, error: expect.any(String) });
    }
    expect(generate).not.toHaveBeenCalled();
  });

  it("이전 형식(message)은 받지 않는다", async () => {
    const res = await post({ message: "배터리" });

    expect(res.status).toBe(400);
    expect((await json(res)).success).toBe(false);
  });

  it("chatId가 문자열이 아니거나 100자를 넘으면 400", async () => {
    for (const chatId of [123, {}, ["a"], "x".repeat(101)]) {
      const res = await post({ query: "배터리", chatId });
      expect(res.status).toBe(400);
      expect((await json(res)).error).toContain("chatId");
    }
  });

  it("chatId는 생략·null·빈 문자열·100자까지 허용한다", async () => {
    for (const chatId of [undefined, null, "", "  ", "x".repeat(100)]) {
      expect((await post({ query: "배터리", chatId })).status).toBe(200);
    }
  });

  it("인덱싱 전이면 409와 인덱싱 안내", async () => {
    resetMockStore();

    const res = await post({ query: "배터리" });

    expect(res.status).toBe(409);
    expect((await json(res)).error).toContain("인덱싱");
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("정상 응답", () => {
  it("{ success, mode, answer, sources } 형태로 응답하고 query를 다듬어 전달한다", async () => {
    generate.mockResolvedValue("배터리는 약 8시간입니다");

    const res = await post({ query: "  배터리는 얼마나 가요?  " });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body).toEqual({
      success: true,
      mode: "mock",
      answer: "배터리는 약 8시간입니다",
      sources: expect.any(Array),
    });
    expect(generate).toHaveBeenCalledWith({ question: "배터리는 얼마나 가요?", sources: body.sources, history: [] });
  });

  it("각 source는 id, title, content, rating, author, date, score만 담는다", async () => {
    const body = await json(await post({ query: "배터리" }));

    expect(body.sources?.map((s) => s.id)).toEqual(["r1", "r2"]);
    expect(Object.keys(body.sources![0]).sort()).toEqual(["author", "content", "date", "id", "rating", "score", "title"]);
    expect(body.sources![0]).toMatchObject({ id: "r1", title: "배터리", content: "8시간 써요", rating: 4, author: "작성자1", date: "2024-01-01" });
    expect(body.sources!.every((s) => s.score >= 0.65 && s.score <= 0.98)).toBe(true);
  });

  it("매칭이 없으면 빈 sources가 아니라 helpful_votes 상위 5건으로 답한다", async () => {
    const body = await json(await post({ query: "zzzqqq" }));

    expect(body.success).toBe(true);
    expect(body.sources?.map((s) => s.id)).toEqual(["r7", "r6", "r5", "r2", "r4"]);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0].sources).toHaveLength(5);
  });

  it("chatId를 생략하면 기본 대화에 저장된다", async () => {
    await post({ query: "배터리" });

    expect(await getMockMessages(undefined)).toEqual([
      { role: "user", content: "배터리" },
      { role: "assistant", content: "답변" },
    ]);
  });
});

describe("chatId별 히스토리", () => {
  it("같은 chatId의 후속 질문에는 이전 대화가 history로 전달된다", async () => {
    await post({ query: "배터리", chatId: "a" });
    await post({ query: "음질은요?", chatId: "a" });

    expect(generate.mock.calls[0][0].history).toEqual([]);
    expect(generate.mock.calls[1][0].history).toEqual([
      { role: "user", content: "배터리" },
      { role: "assistant", content: "답변" },
    ]);
  });

  it("서로 다른 chatId의 대화는 섞이지 않는다", async () => {
    await post({ query: "A의 첫 질문", chatId: "a" });
    await post({ query: "B의 첫 질문", chatId: "b" });
    await post({ query: "A의 둘째 질문", chatId: "a" });

    expect(generate.mock.calls[1][0].history).toEqual([]); // b에는 a의 대화가 보이지 않는다
    expect(generate.mock.calls[2][0].history.map((m) => m.content)).toEqual(["A의 첫 질문", "답변"]);
    expect(await getMockMessages("b")).toHaveLength(2);
  });

  it("chatId 앞뒤 공백은 같은 대화로 본다", async () => {
    await post({ query: "첫 질문", chatId: " a " });
    await post({ query: "둘째 질문", chatId: "a" });

    expect(generate.mock.calls[1][0].history).toHaveLength(2);
  });

  it("history에는 최근 6개 메시지만 쓴다", async () => {
    for (let i = 1; i <= 5; i++) await post({ query: `질문${i}`, chatId: "a" });

    expect(generate.mock.calls[4][0].history).toHaveLength(6);
  });
});

describe("오류 처리", () => {
  it("모델 생성 단계에서 키 오류가 나면 키 설정 안내와 success:false, 저장하지 않음", async () => {
    generate.mockRejectedValue(new MissingApiKeyError());

    const res = await post({ query: "배터리", chatId: "a" });
    const body = await json(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toContain("ANTHROPIC_API_KEY");
    expect(await getMockMessages("a")).toEqual([]);
  });

  it("LLM 오류의 내부 내용은 노출하지 않고 해당 대화도 저장하지 않는다", async () => {
    generate.mockRejectedValue(new Error("secret upstream detail"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post({ query: "배터리", chatId: "a" });
    const body = await json(res);

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).not.toContain("secret");
    expect(await getMockMessages("a")).toEqual([]);
  });

  it("한 대화의 실패가 다른 대화의 기록을 건드리지 않는다", async () => {
    await post({ query: "정상 질문", chatId: "b" });
    generate.mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await post({ query: "실패할 질문", chatId: "a" });

    expect(await getMockMessages("b")).toHaveLength(2);
    expect(await getMockMessages("a")).toEqual([]);
  });

  it("USE_MOCK='false'이면 아직 구현되지 않아 500과 success:false", async () => {
    vi.stubEnv("USE_MOCK", "false");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post({ query: "배터리" });

    expect(res.status).toBe(500);
    expect((await json(res)).success).toBe(false);
  });
});

describe("API 키가 없을 때", () => {
  beforeEach(() => vi.stubEnv("ANTHROPIC_API_KEY", ""));

  it("답변 생성을 생략하고 검색 결과 JSON을 answer로 돌려준다 (sources는 빈 배열)", async () => {
    const res = await post({ query: "배터리는 얼마나 가요?", chatId: "a" });
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, mode: "mock", sources: [] });
    expect(generate).not.toHaveBeenCalled();

    const parsed = JSON.parse(body.answer!);
    expect(parsed.question).toBe("배터리는 얼마나 가요?");
    expect(parsed.note).toContain("ANTHROPIC_API_KEY");
    expect(parsed.count).toBe(2);
    expect(parsed.results.map((r: { rank: number; id: string }) => [r.rank, r.id])).toEqual([[1, "r1"], [2, "r2"]]);
    expect(parsed.results[0]).toEqual({
      rank: 1,
      id: "r1",
      rating: 4,
      author: "작성자1",
      title: "배터리",
      content: "8시간 써요",
      date: "2024-01-01",
      score: expect.any(Number),
    });
  });

  it("매칭되는 리뷰가 없어도 helpful_votes 상위 5건이 JSON에 담긴다", async () => {
    const body = await json(await post({ query: "zzzqqq" }));

    const parsed = JSON.parse(body.answer!);
    expect(parsed.count).toBe(5);
    expect(parsed.results.map((r: { id: string }) => r.id)).toEqual(["r7", "r6", "r5", "r2", "r4"]);
  });

  it("공백뿐인 키도 키 없음으로 취급한다", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "   ");

    const body = await json(await post({ query: "배터리" }));

    expect(body.success).toBe(true);
    expect(generate).not.toHaveBeenCalled();
  });

  it("대화는 chatId별로 저장되고, 검증은 그대로 적용된다", async () => {
    await post({ query: "배터리", chatId: "a" });
    expect(await getMockMessages("a")).toHaveLength(2);

    expect((await post({ query: " " })).status).toBe(400);
    resetMockStore();
    expect((await post({ query: "배터리" })).status).toBe(409);
  });
});
