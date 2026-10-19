import { beforeEach, describe, expect, it, vi } from "vitest";
import { RealStoreError } from "@/lib/errors";
import { countRealReviews, getRealMessages, isRealIndexed, saveRealMessage } from "@/lib/review-store-real";
import { createFakeServices } from "@/lib/test-support/fake-services";
import type { ChatMessage, SourceReview } from "@/lib/types";

const holder = vi.hoisted(() => ({ services: undefined as undefined | ReturnType<typeof createFakeServices> }));
vi.mock("@/lib/clients", () => ({
  REVIEW_NAMESPACE: "reviews",
  getSupabase: () => holder.services!.supabase,
  getReviewNamespace: () => holder.services!.namespace,
}));

let services: ReturnType<typeof createFakeServices>;

const source: SourceReview = { id: "r001", title: "제목", content: "내용", rating: 5, author: "작성자", date: "2024-02-01", score: 0.93 };
const user = (content: string): ChatMessage => ({ role: "user", content });
const assistant = (content: string, sources?: SourceReview[]): ChatMessage => ({ role: "assistant", content, sources });
const rows = () => services.supabase.tables.messages;

beforeEach(() => {
  services = createFakeServices();
  holder.services = services;
});

describe("saveRealMessage", () => {
  it("사용자 메시지는 chat_id, role, content만 저장한다 (sources 없음)", async () => {
    await saveRealMessage("chat-1", user("배터리는?"));

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ chat_id: "chat-1", role: "user", content: "배터리는?" });
    expect(rows()[0]).not.toHaveProperty("sources");
  });

  it("어시스턴트 메시지는 근거 리뷰(sources)를 함께 저장한다", async () => {
    await saveRealMessage("chat-1", assistant("약 8시간입니다", [source]));

    expect(rows()[0]).toMatchObject({ chat_id: "chat-1", role: "assistant", content: "약 8시간입니다", sources: [source] });
  });

  it("sources가 없는 어시스턴트 메시지는 sources 컬럼을 보내지 않는다", async () => {
    await saveRealMessage("chat-1", assistant("답"));

    expect(rows()[0]).not.toHaveProperty("sources");
  });

  it("chatId가 없거나 공백이면 default 대화에 저장한다", async () => {
    await saveRealMessage(undefined, user("1"));
    await saveRealMessage("", user("2"));
    await saveRealMessage("   ", user("3"));

    expect(rows().map((row) => row.chat_id)).toEqual(["default", "default", "default"]);
  });

  it("chatId 앞뒤 공백은 잘라서 저장한다", async () => {
    await saveRealMessage("  abc  ", user("x"));

    expect(rows()[0].chat_id).toBe("abc");
  });

  it("한 번에 한 행씩 messages 테이블에 insert한다", async () => {
    await saveRealMessage("c", user("q"));
    await saveRealMessage("c", assistant("a"));

    expect(services.supabase.callsFor("messages", "insert").map((call) => call.payload.length)).toEqual([1, 1]);
    expect(services.log.every((entry) => !entry.startsWith("pinecone"))).toBe(true);
  });

  it("저장이 실패하면 RealStoreError (원인 코드 보존)", async () => {
    services.supabase.failures["messages.insert"] = { code: "42501", message: "row-level security" };

    const error = await saveRealMessage("c", user("q")).catch((e) => e);

    expect(error).toBeInstanceOf(RealStoreError);
    expect(error.message).toBe("Supabase messages 저장 실패");
    expect((error.cause as Error & { code?: string }).code).toBe("42501");
  });
});

describe("getRealMessages", () => {
  async function seed(chatId: string, count: number) {
    for (let i = 1; i <= count; i++) {
      await saveRealMessage(chatId, i % 2 ? user(`m${i}`) : assistant(`m${i}`));
    }
  }

  it("저장한 순서대로(시간순) 돌려준다", async () => {
    await seed("a", 4);

    expect((await getRealMessages("a")).map((m) => m.content)).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("limit이 있으면 최근 N개를 시간순으로 돌려준다 (8개 중 6개 → m3..m8)", async () => {
    await seed("a", 8);

    const messages = await getRealMessages("a", 6);

    expect(messages.map((m) => m.content)).toEqual(["m3", "m4", "m5", "m6", "m7", "m8"]);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant", "user", "assistant"]);
  });

  it("limit보다 적으면 있는 만큼 돌려준다", async () => {
    await seed("a", 2);

    expect(await getRealMessages("a", 6)).toHaveLength(2);
  });

  it("role과 content만 돌려준다 (sources는 문맥에 필요 없다)", async () => {
    await saveRealMessage("a", assistant("답", [source]));

    expect(await getRealMessages("a")).toEqual([{ role: "assistant", content: "답" }]);
  });

  it("chat_id별로 분리된다", async () => {
    await saveRealMessage("a", user("A의 질문"));
    await saveRealMessage("b", user("B의 질문"));

    expect(await getRealMessages("a")).toEqual([{ role: "user", content: "A의 질문" }]);
    expect(await getRealMessages("b")).toEqual([{ role: "user", content: "B의 질문" }]);
    expect(await getRealMessages("none")).toEqual([]);
  });

  it("chatId가 없으면 default 대화를 읽는다", async () => {
    await saveRealMessage(undefined, user("기본 대화"));

    expect(await getRealMessages(undefined)).toEqual([{ role: "user", content: "기본 대화" }]);
    expect(await getRealMessages("default")).toHaveLength(1);
  });

  it("user/assistant가 아닌 role은 문맥에서 제외한다", async () => {
    rows().push({ id: "x", chat_id: "a", role: "system", content: "시스템", created_at: "2024-01-01T00:00:00.000Z" });
    await saveRealMessage("a", user("질문"));

    expect(await getRealMessages("a")).toEqual([{ role: "user", content: "질문" }]);
  });

  it("조회는 messages 테이블에서 chat_id로 필터링한다", async () => {
    await getRealMessages("a", 6);

    const [call] = services.supabase.callsFor("messages", "select");
    expect(call.filtersCount).toBe(1);
  });

  it("조회가 실패하면 RealStoreError", async () => {
    services.supabase.failures["messages.select"] = { message: "boom" };

    await expect(getRealMessages("a")).rejects.toThrow("Supabase messages 조회 실패");
  });
});

describe("countRealReviews", () => {
  it("Supabase reviews의 행 수를 돌려준다", async () => {
    services.supabase.tables.reviews.push({ id: "r1" }, { id: "r2" }, { id: "r3" });

    expect(await countRealReviews()).toBe(3);
  });

  it("비어 있으면 0이다", async () => {
    expect(await countRealReviews()).toBe(0);
  });

  it("행을 내려받지 않고 건수만 센다 (head 조회)", async () => {
    services.supabase.tables.reviews.push({ id: "r1" });

    await countRealReviews();

    expect(services.supabase.callsFor("reviews", "select")).toHaveLength(1);
  });

  it("조회가 실패하면 RealStoreError", async () => {
    services.supabase.failures["reviews.select"] = { message: "boom" };

    await expect(countRealReviews()).rejects.toThrow(RealStoreError);
  });
});

describe("isRealIndexed", () => {
  it("Supabase와 Pinecone이 모두 비어 있으면 false", async () => {
    expect(await isRealIndexed()).toBe(false);
  });

  it("두 저장소 모두 적재되어 있으면 true", async () => {
    services.supabase.tables.reviews.push({ id: "r1" });
    services.namespace.records.set("r1", {});

    expect(await isRealIndexed()).toBe(true);
  });

  it("Supabase에만 있고 Pinecone이 비어 있으면 false (한쪽만 적재된 상태)", async () => {
    services.supabase.tables.reviews.push({ id: "r1" });

    expect(await isRealIndexed()).toBe(false);
  });

  it("Pinecone에만 있고 Supabase가 비어 있으면 false", async () => {
    services.namespace.records.set("r1", {});

    expect(await isRealIndexed()).toBe(false);
  });

  it("어느 한쪽 조회가 실패하면 RealStoreError", async () => {
    services.namespace.failures.describeIndexStats = new Error("stats down");

    await expect(isRealIndexed()).rejects.toThrow("Pinecone 통계 조회 실패");
  });
});
