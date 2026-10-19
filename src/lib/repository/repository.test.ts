import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentMode, getRepository, isMockMode } from "@/lib/repository";
import { MockReviewRepository } from "@/lib/repository/mock";
import { RealReviewRepository } from "@/lib/repository/real";
import { resetMockStore } from "@/lib/review-store";
import type { Review } from "@/lib/types";

const fixture: Review[] = [
  { id: "r1", rating: 5, author: "a", title: "배터리", content: "오래 가요", date: "2024-01-01", helpfulVotes: 3, verifiedPurchase: false },
  { id: "r2", rating: 3, author: "b", title: "음질", content: "보통이에요", date: "2024-01-02", helpfulVotes: 9, verifiedPurchase: false },
];

beforeEach(() => resetMockStore());
afterEach(() => vi.unstubAllEnvs());

describe("MockReviewRepository (review-store 어댑터)", () => {
  it("인덱싱 전에는 isIndexed가 false, count가 0이며 검색 결과가 없다", async () => {
    const repo = new MockReviewRepository(async () => fixture);

    expect(await repo.isIndexed()).toBe(false);
    expect(await repo.count()).toBe(0);
    expect(await repo.search("배터리")).toEqual([]);
  });

  it("인덱싱하면 적재 건수를 반환하고 count와 같다", async () => {
    const repo = new MockReviewRepository(async () => fixture);

    expect(await repo.index()).toBe(2);
    expect(await repo.isIndexed()).toBe(true);
    expect(await repo.count()).toBe(2);
  });

  it("기본 생성자는 samples/review.csv 100건을 적재한다", async () => {
    expect(await new MockReviewRepository().index()).toBe(100);
  });

  it("재인덱싱해도 중복 적재되지 않고 새 데이터로 대체된다", async () => {
    await new MockReviewRepository(async () => fixture).index();
    await new MockReviewRepository(async () => fixture).index();
    expect(await new MockReviewRepository().count()).toBe(2);

    await new MockReviewRepository(async () => [fixture[1]]).index();

    const repo = new MockReviewRepository();
    expect(await repo.count()).toBe(1);
    expect((await repo.search("배터리")).map((s) => s.id)).toEqual(["r2"]);
  });

  it("인덱싱에 실패하면 기존 상태를 유지하고 오류를 전파한다", async () => {
    await new MockReviewRepository(async () => fixture).index();
    const failing = new MockReviewRepository(async () => {
      throw new Error("읽기 실패");
    });

    await expect(failing.index()).rejects.toThrow("읽기 실패");
    expect(await failing.count()).toBe(2);
  });

  it("서로 다른 인스턴스(라우트)가 같은 상태를 공유한다", async () => {
    await new MockReviewRepository(async () => fixture).index();

    const other = new MockReviewRepository(async () => []);
    expect(await other.isIndexed()).toBe(true);
    expect((await other.search("음질"))[0]).toMatchObject({ id: "r2", date: "2024-01-02" });
  });

  it("검색 결과는 score를 가진 source 형태이고 helpfulVotes는 노출하지 않는다", async () => {
    const repo = new MockReviewRepository(async () => fixture);
    await repo.index();

    const [first] = await repo.search("배터리");

    expect(first).toEqual({
      id: "r1",
      title: "배터리",
      content: "오래 가요",
      rating: 5,
      author: "a",
      date: "2024-01-01",
      score: expect.any(Number),
    });
  });

  it("대화는 chatId별로 저장되고 최근 limit개만 돌려준다", async () => {
    const repo = new MockReviewRepository(async () => fixture);
    for (let i = 1; i <= 8; i++) {
      await repo.appendMessage("chat-a", { role: i % 2 ? "user" : "assistant", content: `m${i}` });
    }
    await repo.appendMessage("chat-b", { role: "user", content: "other" });

    expect(await repo.getHistory("chat-a")).toHaveLength(8);
    expect((await repo.getHistory("chat-a", 6)).map((m) => m.content)).toEqual(["m3", "m4", "m5", "m6", "m7", "m8"]);
    expect((await repo.getHistory("chat-b")).map((m) => m.content)).toEqual(["other"]);
  });

  it("chatId가 없으면 기본 대화를 공유한다", async () => {
    const repo = new MockReviewRepository(async () => fixture);

    await repo.appendMessage(undefined, { role: "user", content: "x" });

    expect(await repo.getHistory(undefined)).toEqual([{ role: "user", content: "x" }]);
  });
});

describe("getRepository / isMockMode", () => {
  it("USE_MOCK이 설정되지 않으면 Mock Mode이다", () => {
    vi.stubEnv("USE_MOCK", undefined);
    expect(isMockMode()).toBe(true);
    expect(getRepository()).toBeInstanceOf(MockReviewRepository);
  });

  it("'false'가 아닌 값('true', 빈 문자열)은 Mock Mode이다", () => {
    vi.stubEnv("USE_MOCK", "true");
    expect(isMockMode()).toBe(true);
    vi.stubEnv("USE_MOCK", "");
    expect(isMockMode()).toBe(true);
  });

  it("'false'이면 실데이터 모드이고 실데이터 저장소를 돌려준다 (더 이상 '구현되지 않음' 오류가 아니다)", () => {
    vi.stubEnv("USE_MOCK", "false");

    expect(isMockMode()).toBe(false);
    expect(getRepository()).toBeInstanceOf(RealReviewRepository);
    expect(getRepository()).not.toBeInstanceOf(MockReviewRepository);
  });

  it("USE_MOCK을 바꾸면 다음 호출부터 해당 모드의 저장소를 돌려준다", () => {
    vi.stubEnv("USE_MOCK", "false");
    const real = getRepository();
    vi.stubEnv("USE_MOCK", "true");
    const mock = getRepository();
    vi.stubEnv("USE_MOCK", "false");

    expect(mock).toBeInstanceOf(MockReviewRepository);
    expect(getRepository()).toBe(real); // 모드별로 한 번만 만든다
  });

  it("currentMode는 모드에 맞는 값을 돌려준다", () => {
    vi.stubEnv("USE_MOCK", "false");
    expect(currentMode()).toBe("real");
    vi.stubEnv("USE_MOCK", undefined);
    expect(currentMode()).toBe("mock");
  });
});
