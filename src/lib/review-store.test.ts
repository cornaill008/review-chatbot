import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CHAT_ID,
  MAX_CHATS,
  MAX_MESSAGES_PER_CHAT,
  countMockReviews,
  getMockMessages,
  indexMockReviews,
  isMockIndexed,
  resetMockStore,
  saveMockMessage,
  searchMockReviews,
} from "@/lib/review-store";
import type { ChatMessage, Review } from "@/lib/types";

const fixture: Review[] = [
  { id: "r1", rating: 5, author: "a", title: "배터리", content: "오래 가요", date: "2024-01-01", helpfulVotes: 3 },
  { id: "r2", rating: 3, author: "b", title: "음질", content: "보통이에요", date: "2024-01-02", helpfulVotes: 9 },
];

const user = (content: string): ChatMessage => ({ role: "user", content });

beforeEach(() => resetMockStore());

describe("indexMockReviews / searchMockReviews", () => {
  it("실제 samples/review.csv를 읽어 100건을 적재하고 건수를 반환한다", async () => {
    expect(await isMockIndexed()).toBe(false);
    expect(await countMockReviews()).toBe(0);

    expect(await indexMockReviews()).toBe(100);

    expect(await isMockIndexed()).toBe(true);
    expect(await countMockReviews()).toBe(100);
  });

  it("재인덱싱해도 중복 적재되지 않고 새 데이터로 대체된다", async () => {
    await indexMockReviews(async () => fixture);
    await indexMockReviews(async () => fixture);
    expect(await countMockReviews()).toBe(2);

    await indexMockReviews(async () => [fixture[1]]);
    expect(await countMockReviews()).toBe(1);
    expect((await searchMockReviews("배터리", 5)).map((s) => s.id)).toEqual(["r2"]); // r1은 사라졌다
  });

  it("인덱싱에 실패하면 기존 상태를 유지하고 오류를 전파한다", async () => {
    await indexMockReviews(async () => fixture);

    await expect(
      indexMockReviews(async () => {
        throw new Error("읽기 실패");
      }),
    ).rejects.toThrow("읽기 실패");

    expect(await countMockReviews()).toBe(2);
    expect(await isMockIndexed()).toBe(true);
  });

  it("인덱싱 전 검색은 빈 배열이다", async () => {
    expect(await searchMockReviews("배터리")).toEqual([]);
  });

  it("기본 topK는 5이고 지정하면 따른다. 결과는 score를 가진 source 형태다", async () => {
    await indexMockReviews();

    const byDefault = await searchMockReviews("배터리");
    const one = await searchMockReviews("배터리", 1);

    expect(byDefault).toHaveLength(5);
    expect(one).toHaveLength(1);
    expect(byDefault[0]).toEqual({
      id: expect.stringMatching(/^r\d+$/),
      title: expect.any(String),
      content: expect.any(String),
      rating: expect.any(Number),
      author: expect.any(String),
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      score: expect.any(Number),
    });
    expect(byDefault.every((s) => s.score >= 0.65 && s.score <= 0.98)).toBe(true);
  });

  it("매칭이 없는 질문은 helpful_votes 상위 5건을 반환한다", async () => {
    await indexMockReviews();

    expect(await searchMockReviews("zzzqqq")).toHaveLength(5);
  });
});

describe("saveMockMessage / getMockMessages", () => {
  it("대화를 순서대로 저장하고 최근 limit개만 돌려준다", async () => {
    for (let i = 1; i <= 8; i++) await saveMockMessage("a", user(`m${i}`));

    expect((await getMockMessages("a")).map((m) => m.content)).toHaveLength(8);
    expect((await getMockMessages("a", 3)).map((m) => m.content)).toEqual(["m6", "m7", "m8"]);
  });

  it("chatId별로 분리된다", async () => {
    await saveMockMessage("a", user("A의 질문"));
    await saveMockMessage("b", user("B의 질문"));

    expect(await getMockMessages("a")).toEqual([user("A의 질문")]);
    expect(await getMockMessages("b")).toEqual([user("B의 질문")]);
    expect(await getMockMessages("c")).toEqual([]);
  });

  it("chatId가 없거나 비어 있으면 하나의 기본 대화를 공유한다", async () => {
    await saveMockMessage(undefined, user("1"));
    await saveMockMessage("", user("2"));
    await saveMockMessage("   ", user("3"));
    await saveMockMessage(DEFAULT_CHAT_ID, user("4"));

    expect((await getMockMessages(undefined)).map((m) => m.content)).toEqual(["1", "2", "3", "4"]);
    expect(await getMockMessages(DEFAULT_CHAT_ID)).toHaveLength(4);
  });

  it("chatId 앞뒤 공백은 무시한다", async () => {
    await saveMockMessage(" a ", user("x"));

    expect(await getMockMessages("a")).toEqual([user("x")]);
  });

  it(`대화당 ${MAX_MESSAGES_PER_CHAT}개를 넘으면 가장 오래된 메시지부터 제거한다`, async () => {
    for (let i = 1; i <= MAX_MESSAGES_PER_CHAT + 50; i++) await saveMockMessage("a", user(`m${i}`));

    const all = await getMockMessages("a");
    expect(all).toHaveLength(MAX_MESSAGES_PER_CHAT);
    expect(all[0].content).toBe("m51");
    expect(all.at(-1)?.content).toBe(`m${MAX_MESSAGES_PER_CHAT + 50}`);
  });

  it(`대화가 ${MAX_CHATS}개를 넘으면 가장 오래 저장되지 않은 대화부터 제거한다`, async () => {
    for (let i = 1; i <= MAX_CHATS; i++) await saveMockMessage(`chat-${i}`, user("q"));
    await saveMockMessage("chat-1", user("다시 사용")); // chat-1이 가장 최근이 된다

    await saveMockMessage("new-chat", user("q")); // 101번째 대화 → chat-2가 밀려난다

    expect(await getMockMessages("chat-1")).toHaveLength(2);
    expect(await getMockMessages("chat-2")).toEqual([]);
    expect(await getMockMessages("chat-3")).toHaveLength(1);
    expect(await getMockMessages("new-chat")).toHaveLength(1);
  });

  it("반환값을 바꿔도 저장된 대화는 영향받지 않는다", async () => {
    await saveMockMessage("a", user("x"));

    (await getMockMessages("a")).push(user("끼워넣기"));

    expect(await getMockMessages("a")).toEqual([user("x")]);
  });
});
