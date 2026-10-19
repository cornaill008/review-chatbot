import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 실데이터 함수는 전부 가짜로 바꾼다. 어댑터가 올바른 인수로 위임하는지만 본다.
const real = vi.hoisted(() => ({
  indexRealReviews: vi.fn(),
  searchRealReviews: vi.fn(),
  isRealIndexed: vi.fn(),
  countRealReviews: vi.fn(),
  saveRealMessage: vi.fn(),
  getRealMessages: vi.fn(),
  getReviewNamespace: vi.fn(),
  getSupabase: vi.fn(),
}));

vi.mock("@/lib/review-store-real", () => ({
  indexRealReviews: real.indexRealReviews,
  searchRealReviews: real.searchRealReviews,
  isRealIndexed: real.isRealIndexed,
  countRealReviews: real.countRealReviews,
  saveRealMessage: real.saveRealMessage,
  getRealMessages: real.getRealMessages,
}));

// Mock 모드가 실데이터 클라이언트를 만들지 않는지 보려고 클라이언트 생성기도 감시한다.
vi.mock("@/lib/clients", () => ({
  REVIEW_NAMESPACE: "reviews",
  getReviewNamespace: real.getReviewNamespace,
  getSupabase: real.getSupabase,
}));

import { getRepository } from "@/lib/repository";
import { MockReviewRepository } from "@/lib/repository/mock";
import { RealReviewRepository } from "@/lib/repository/real";
import { resetMockStore } from "@/lib/review-store";
import type { SourceReview } from "@/lib/types";

const source: SourceReview = { id: "r1", title: "t", content: "c", rating: 5, author: "a", date: "2024-01-01", score: 0.9 };

beforeEach(() => resetMockStore());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("RealReviewRepository (review-store-real 어댑터)", () => {
  it("index()는 indexRealReviews()의 결과를 그대로 돌려준다", async () => {
    real.indexRealReviews.mockResolvedValue(100);

    expect(await new RealReviewRepository().index()).toBe(100);
    expect(real.indexRealReviews).toHaveBeenCalledTimes(1);
  });

  it("search(query, topK)는 같은 인수로 위임한다", async () => {
    real.searchRealReviews.mockResolvedValue([source]);

    expect(await new RealReviewRepository().search("배터리", 3)).toEqual([source]);
    expect(real.searchRealReviews).toHaveBeenCalledWith("배터리", 3);
  });

  it("topK를 생략하면 undefined로 위임한다 (기본값은 저장소 함수가 정한다)", async () => {
    real.searchRealReviews.mockResolvedValue([]);

    await new RealReviewRepository().search("q");

    expect(real.searchRealReviews).toHaveBeenCalledWith("q", undefined);
  });

  it("isIndexed()와 count()는 각각 isRealIndexed()와 countRealReviews()에 위임한다", async () => {
    real.isRealIndexed.mockResolvedValue(true);
    real.countRealReviews.mockResolvedValue(100);
    const repo = new RealReviewRepository();

    expect(await repo.isIndexed()).toBe(true);
    expect(await repo.count()).toBe(100);
  });

  it("appendMessage(chatId, message)는 sources까지 그대로 saveRealMessage에 넘긴다", async () => {
    real.saveRealMessage.mockResolvedValue(undefined);
    const message = { role: "assistant" as const, content: "답", sources: [source] };

    await new RealReviewRepository().appendMessage("chat-1", message);

    expect(real.saveRealMessage).toHaveBeenCalledWith("chat-1", message);
  });

  it("getHistory(chatId, limit)는 getRealMessages에 위임한다", async () => {
    real.getRealMessages.mockResolvedValue([{ role: "user", content: "q" }]);

    expect(await new RealReviewRepository().getHistory("chat-1", 6)).toEqual([{ role: "user", content: "q" }]);
    expect(real.getRealMessages).toHaveBeenCalledWith("chat-1", 6);
  });

  it("저장소 함수의 오류를 그대로 전달한다", async () => {
    real.indexRealReviews.mockRejectedValue(new Error("실패"));

    await expect(new RealReviewRepository().index()).rejects.toThrow("실패");
  });

  it("객체를 만드는 것만으로는 외부 서비스에 접속하지 않는다", () => {
    new RealReviewRepository();

    expect(real.getReviewNamespace).not.toHaveBeenCalled();
    expect(real.getSupabase).not.toHaveBeenCalled();
  });
});

describe("팩토리: 모드별 선택", () => {
  it("USE_MOCK='false'일 때만 실데이터 저장소를 돌려준다", () => {
    vi.stubEnv("USE_MOCK", "false");

    expect(getRepository()).toBeInstanceOf(RealReviewRepository);
  });

  it.each([[undefined], ["true"], [""], ["FALSE"], ["0"], ["no"]])(
    "USE_MOCK=%j이면 Mock 저장소다 ('false' 정확히 일치할 때만 실데이터)",
    (value) => {
      vi.stubEnv("USE_MOCK", value);

      expect(getRepository()).toBeInstanceOf(MockReviewRepository);
    },
  );
});

describe("Mock 모드는 Pinecone·Supabase를 건드리지 않는다", () => {
  it("인덱싱·검색·대화 저장과 조회·상태 전부에서 실데이터 함수와 클라이언트가 호출되지 않는다", async () => {
    vi.stubEnv("USE_MOCK", "true");
    const repo = getRepository();

    expect(await repo.index()).toBe(100);
    expect((await repo.search("배터리")).length).toBeGreaterThan(0);
    await repo.appendMessage("c", { role: "user", content: "q" });
    expect(await repo.getHistory("c", 6)).toHaveLength(1);
    expect(await repo.isIndexed()).toBe(true);
    expect(await repo.count()).toBe(100);

    for (const spy of Object.values(real)) expect(spy).not.toHaveBeenCalled();
  });
});
