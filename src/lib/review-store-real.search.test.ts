import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigError, RealStoreError } from "@/lib/errors";
import { searchRealReviews } from "@/lib/review-store-real";
import { createFakeServices, type FakeHit } from "@/lib/test-support/fake-services";

const holder = vi.hoisted(() => ({ services: undefined as undefined | ReturnType<typeof createFakeServices>, configError: undefined as Error | undefined }));
vi.mock("@/lib/clients", () => ({
  REVIEW_NAMESPACE: "reviews",
  getSupabase: () => {
    if (holder.configError) throw holder.configError;
    return holder.services!.supabase;
  },
  getReviewNamespace: () => {
    if (holder.configError) throw holder.configError;
    return holder.services!.namespace;
  },
}));

let services: ReturnType<typeof createFakeServices>;

const hit = (id: string, score: number, extra: Record<string, unknown> = {}): FakeHit => ({
  _id: id,
  _score: score,
  fields: { title: `제목 ${id}`, content: `내용 ${id}`, rating: 4, author: `작성자 ${id}`, ...extra },
});

function seedDates(dates: Record<string, string>) {
  for (const [id, date] of Object.entries(dates)) services.supabase.tables.reviews.push({ id, date });
}

beforeEach(() => {
  services = createFakeServices();
  holder.services = services;
  holder.configError = undefined;
});

afterEach(() => vi.restoreAllMocks());

describe("Pinecone 검색 요청", () => {
  it("질문 텍스트와 topK 5를 searchRecords에 그대로 전달한다 (임베딩 벡터 없음)", async () => {
    services.namespace.searchHits = [hit("r001", 0.5)];

    await searchRealReviews("배터리는 얼마나 가요?");

    expect(services.namespace.searchCalls).toEqual([
      {
        query: { topK: 5, inputs: { text: "배터리는 얼마나 가요?" } },
        fields: ["title", "content", "rating", "author"],
      },
    ]);
    const query = services.namespace.searchCalls[0].query as Record<string, unknown>;
    expect(query).not.toHaveProperty("vector");
    expect(query).not.toHaveProperty("values");
  });

  it("topK를 지정하면 그 값을 쓴다", async () => {
    await searchRealReviews("질문", 3);

    expect((services.namespace.searchCalls[0].query as { topK: number }).topK).toBe(3);
  });

  it("질문은 가공하지 않고 한 번만 검색한다", async () => {
    await searchRealReviews("  앞뒤 공백 ? 그대로  ");

    expect(services.namespace.searchCalls).toHaveLength(1);
    expect((services.namespace.searchCalls[0].query as { inputs: { text: string } }).inputs.text).toBe("  앞뒤 공백 ? 그대로  ");
  });
});

describe("source 구성", () => {
  it("{ id, title, content, rating, author, date, score }만 담는다", async () => {
    services.namespace.searchHits = [hit("r001", 0.5)];
    seedDates({ r001: "2024-02-01" });

    const [source] = await searchRealReviews("q");

    expect(Object.keys(source).sort()).toEqual(["author", "content", "date", "id", "rating", "score", "title"]);
    expect(source).toEqual({
      id: "r001",
      title: "제목 r001",
      content: "내용 r001",
      rating: 4,
      author: "작성자 r001",
      date: "2024-02-01",
      score: 0.82,
    });
  });

  it("결과 순서는 Pinecone의 순위 그대로이고 점수는 앞에서 뒤로 갈수록 같거나 작다", async () => {
    services.namespace.searchHits = [hit("r008", 0.31), hit("r044", 0.27), hit("r022", 0.27), hit("r056", 0.05), hit("r086", 0.001)];

    const sources = await searchRealReviews("q");

    expect(sources.map((s) => s.id)).toEqual(["r008", "r044", "r022", "r056", "r086"]);
    const scores = sources.map((s) => s.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("평점은 숫자로, 문자열로 와도 숫자로 바꾼다", async () => {
    services.namespace.searchHits = [hit("r001", 0.5, { rating: "5" }), hit("r002", 0.4, { rating: 3 })];

    const sources = await searchRealReviews("q");

    expect(sources.map((s) => s.rating)).toEqual([5, 3]);
  });

  it("필드가 빠진 결과도 빈 값으로 채워 오류 없이 돌려준다", async () => {
    services.namespace.searchHits = [{ _id: "r001", _score: 0.5 }, { _id: "r002", _score: 0.4, fields: { title: "제목만" } }];

    const sources = await searchRealReviews("q");

    expect(sources[0]).toMatchObject({ id: "r001", title: "", content: "", rating: 0, author: "" });
    expect(sources[1]).toMatchObject({ id: "r002", title: "제목만", content: "", rating: 0, author: "" });
  });

  it("결과가 없으면 빈 배열이고 Supabase는 조회하지 않는다", async () => {
    services.namespace.searchHits = [];

    expect(await searchRealReviews("q")).toEqual([]);

    expect(services.log.filter((entry) => entry.startsWith("supabase"))).toEqual([]);
  });
});

describe("점수 매핑 (0.65 + 0.33 × 점수, 0~1로 제한)", () => {
  it.each([
    [0.5, 0.82],
    [0, 0.65],
    [1, 0.98],
    [1.3, 0.98],
    [-0.2, 0.65],
    [0.24113620817661285, 0.73], // 실제 Pinecone 점수 예시
    [0.006322240456938744, 0.65],
  ])("Pinecone 점수 %d → %d", async (pineconeScore, expected) => {
    services.namespace.searchHits = [hit("r001", pineconeScore)];

    const [source] = await searchRealReviews("q");

    expect(source.score).toBe(expected);
  });

  it("모든 점수가 0.65 이상 0.98 이하다", async () => {
    services.namespace.searchHits = [hit("a", 5), hit("b", 0.9), hit("c", 0.3), hit("d", 0), hit("e", -3)];

    const sources = await searchRealReviews("q");

    expect(sources.every((s) => s.score >= 0.65 && s.score <= 0.98)).toBe(true);
  });
});

describe("작성일 보강 (Supabase)", () => {
  it("검색된 id를 한 번의 in() 조회로 가져온다", async () => {
    services.namespace.searchHits = [hit("r001", 0.5), hit("r002", 0.4), hit("r003", 0.3)];
    seedDates({ r001: "2024-01-01", r002: "2024-01-02", r003: "2024-01-03" });

    const sources = await searchRealReviews("q");

    expect(sources.map((s) => s.date)).toEqual(["2024-01-01", "2024-01-02", "2024-01-03"]);
    expect(services.supabase.callsFor("reviews", "select")).toHaveLength(1);
    expect(services.supabase.callsFor("reviews", "select")[0].filtersCount).toBe(1);
  });

  it("Supabase에 없는 id의 작성일은 빈 문자열이다", async () => {
    services.namespace.searchHits = [hit("r001", 0.5), hit("ghost", 0.4)];
    seedDates({ r001: "2024-01-01" });

    const sources = await searchRealReviews("q");

    expect(sources.map((s) => s.date)).toEqual(["2024-01-01", ""]);
  });

  it("작성일 값이 null이면 빈 문자열이다", async () => {
    services.namespace.searchHits = [hit("r001", 0.5)];
    services.supabase.tables.reviews.push({ id: "r001", date: null });

    const [source] = await searchRealReviews("q");

    expect(source.date).toBe("");
  });

  it("작성일 조회가 실패해도 검색은 계속하고 작성일만 빈 문자열이며 경고를 남긴다", async () => {
    services.namespace.searchHits = [hit("r001", 0.5), hit("r002", 0.4)];
    services.supabase.failures["reviews.select"] = { code: "PGRST301", message: "JWT expired" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const sources = await searchRealReviews("q");

    expect(sources.map((s) => s.id)).toEqual(["r001", "r002"]);
    expect(sources.every((s) => s.date === "")).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][1])).toContain("[PGRST301]");
  });
});

describe("실패", () => {
  it("Pinecone 검색이 실패하면 RealStoreError이고 Supabase는 건드리지 않는다", async () => {
    services.namespace.failures.searchRecords = new Error("pinecone down");

    const error = await searchRealReviews("q").catch((e) => e);

    expect(error).toBeInstanceOf(RealStoreError);
    expect(error.message).toBe("Pinecone 검색 실패");
    expect(services.log.filter((entry) => entry.startsWith("supabase"))).toEqual([]);
  });

  it("설정이 없으면 ConfigError를 그대로 전달한다", async () => {
    holder.configError = new ConfigError(["PINECONE_API_KEY"]);

    await expect(searchRealReviews("q")).rejects.toThrow(ConfigError);
  });
});
