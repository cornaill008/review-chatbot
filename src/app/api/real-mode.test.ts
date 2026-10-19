import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 라우트와 실데이터 저장소는 실제 코드를 쓰고, 외부 서비스 클라이언트와 LLM 호출만 가짜로 바꾼다.
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

const holder = vi.hoisted(() => ({ services: undefined as undefined | ReturnType<typeof import("@/lib/test-support/fake-services").createFakeServices>, configError: undefined as Error | undefined }));
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

vi.mock("@/lib/chain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chain")>();
  return { ...actual, generateAnswer: vi.fn() };
});

import { POST as chatPOST } from "@/app/api/chat/route";
import { POST as indexPOST } from "@/app/api/index-data/route";
import { GET as statusGET } from "@/app/api/status/route";
import { generateAnswer } from "@/lib/chain";
import { ConfigError } from "@/lib/errors";
import { resetMockStore } from "@/lib/review-store";
import { createFakeServices, type FakeHit } from "@/lib/test-support/fake-services";
import type { ApiResponse, ChatResponse, IndexResult, StatusData } from "@/lib/types";

const generate = vi.mocked(generateAnswer);
let services: ReturnType<typeof createFakeServices>;

const CONFIG_NAMES = [
  "PINECONE_API_KEY",
  "PINECONE_INDEX_NAME",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

// samples/review.csv의 실제 리뷰(id, 작성일)에 맞춘 검색 결과
const HITS: FakeHit[] = [
  { _id: "r008", _score: 0.31, fields: { title: "배터리 진짜 오래 가요", content: "완충하면 하루 종일 써도 됩니다.", rating: 5, author: "배터리괴물" } },
  { _id: "r044", _score: 0.27, fields: { title: "두 달 만에 배터리 반토막", content: "배터리 열화가 너무 빠르네요.", rating: 1, author: "배신감" } },
  { _id: "r022", _score: 0.05, fields: { title: "배터리 광고랑 다릅니다", content: "4시간 반이면 방전됩니다.", rating: 2, author: "실망함" } },
];

const post = (route: typeof chatPOST, body: unknown) =>
  route(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify(body) }));
const json = async <T>(res: Response) => (await res.json()) as T;
const index = async () => json<ApiResponse<IndexResult>>(await indexPOST());
const status = async () => json<ApiResponse<StatusData>>(await statusGET());
const chat = async (query: string, chatId?: string) => {
  const res = await post(chatPOST, { query, chatId });
  return { res, body: await json<ChatResponse>(res) };
};
const messages = (chatId: string) => services.supabase.tables.messages.filter((row) => row.chat_id === chatId);

beforeEach(() => {
  services = createFakeServices();
  holder.services = services;
  holder.configError = undefined;
  resetMockStore();
  generate.mockReset();
  generate.mockResolvedValue("배터리는 약 8시간입니다");
  vi.stubEnv("USE_MOCK", "false");
  vi.stubEnv("KIMI_API_KEY", "test-kimi-key");
  services.namespace.searchHits = HITS;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("실데이터 모드: 인덱싱과 상태", () => {
  it("인덱싱 전에는 indexed:false, count:0이고 질문하면 인덱싱 안내(409)를 받는다", async () => {
    const before = await status();
    const asked = await chat("배터리는?");

    expect(before).toEqual({ success: true, data: { mode: "real", indexed: false, count: 0 } });
    expect(asked.res.status).toBe(409);
    expect(asked.body.error).toContain("인덱싱");
    expect(generate).not.toHaveBeenCalled();
  });

  it("인덱싱하면 mode:'real', indexed:100이고 두 저장소에 100건씩 적재된다", async () => {
    const indexed = await index();

    expect(indexed).toEqual({ success: true, mode: "real", data: { indexed: 100 } });
    expect(services.supabase.tables.reviews).toHaveLength(100);
    expect(services.namespace.records.size).toBe(100);
  });

  it("인덱싱 후 상태는 indexed:true, count:100이다", async () => {
    await index();

    expect(await status()).toEqual({ success: true, data: { mode: "real", indexed: true, count: 100 } });
  });

  it("같은 요청을 반복해도 100건 그대로다 (중복 없음)", async () => {
    await index();
    await index();

    expect(services.supabase.tables.reviews).toHaveLength(100);
    expect(services.namespace.records.size).toBe(100);
    expect((await status()).data?.count).toBe(100);
  });

  it("Supabase 행에는 CSV의 작성일·도움이 됨 수·구매 인증이 담긴다", async () => {
    await index();

    const row = services.supabase.tables.reviews.find((r) => r.id === "r008");
    expect(row).toMatchObject({ id: "r008", date: "2024-02-01", helpful_votes: 11, verified_purchase: true, rating: 5 });
  });

  it("Pinecone 적재가 실패하면 success:false이고 status의 indexed는 false다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    services.namespace.failures.upsertRecords = new Error("pinecone down");

    const failed = await index();
    const after = await status();

    expect(failed).toEqual({ success: false, error: "인덱싱 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." });
    expect(services.supabase.tables.reviews).toHaveLength(100); // 되돌리지 않는다
    expect(after.data).toEqual({ mode: "real", indexed: false, count: 100 }); // 한쪽만 적재된 상태
  });

  it("실패 후 다시 인덱싱하면 복구된다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    services.namespace.failures.upsertRecords = new Error("pinecone down");
    await index();

    services.namespace.failures = {};
    const retried = await index();

    expect(retried.success).toBe(true);
    expect((await status()).data).toEqual({ mode: "real", indexed: true, count: 100 });
  });
});

describe("실데이터 모드: 질문과 대화 기록", () => {
  beforeEach(async () => {
    await index();
  });

  it("Pinecone 검색 결과로 sources를 만들고 작성일은 Supabase에서 채운다", async () => {
    const { res, body } = await chat("배터리는 얼마나 가요?", "chat-1");

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.mode).toBe("real");
    expect(body.answer).toBe("배터리는 약 8시간입니다");
    expect(body.sources).toEqual([
      { id: "r008", title: "배터리 진짜 오래 가요", content: "완충하면 하루 종일 써도 됩니다.", rating: 5, author: "배터리괴물", date: "2024-02-01", score: 0.75 },
      { id: "r044", title: "두 달 만에 배터리 반토막", content: "배터리 열화가 너무 빠르네요.", rating: 1, author: "배신감", date: "2024-03-26", score: 0.74 },
      { id: "r022", title: "배터리 광고랑 다릅니다", content: "4시간 반이면 방전됩니다.", rating: 2, author: "실망함", date: "2024-03-04", score: 0.67 },
    ]);
  });

  it("Pinecone에는 질문 텍스트와 topK 5를 전달한다 (임베딩 벡터 없음)", async () => {
    await chat("배터리는 얼마나 가요?");

    expect(services.namespace.searchCalls).toEqual([
      { query: { topK: 5, inputs: { text: "배터리는 얼마나 가요?" } }, fields: ["title", "content", "rating", "author"] },
    ]);
  });

  it("질문과 답변이 Supabase messages에 순서대로 저장되고 어시스턴트 행에 sources가 담긴다", async () => {
    const { body } = await chat("배터리는?", "chat-1");

    const saved = messages("chat-1");
    expect(saved.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(saved.map((row) => row.content)).toEqual(["배터리는?", "배터리는 약 8시간입니다"]);
    expect(saved[0]).not.toHaveProperty("sources");
    expect(saved[1].sources).toEqual(body.sources);
  });

  it("후속 질문에는 Supabase에 저장된 같은 chatId의 이전 대화가 history로 전달된다", async () => {
    await chat("배터리는?", "chat-1");
    await chat("단점은요?", "chat-1");

    expect(generate.mock.calls[0][0].history).toEqual([]);
    expect(generate.mock.calls[1][0].history).toEqual([
      { role: "user", content: "배터리는?" },
      { role: "assistant", content: "배터리는 약 8시간입니다" },
    ]);
  });

  it("history에는 sources를 싣지 않고 role과 content만 넘긴다", async () => {
    await chat("배터리는?", "chat-1");
    await chat("단점은요?", "chat-1");

    for (const message of generate.mock.calls[1][0].history) expect(Object.keys(message).sort()).toEqual(["content", "role"]);
  });

  it("history는 최근 6개만 읽는다", async () => {
    for (let i = 1; i <= 5; i++) await chat(`질문${i}`, "chat-1");

    expect(generate.mock.calls[4][0].history).toHaveLength(6);
  });

  it("chatId별로 대화가 분리된다", async () => {
    await chat("A의 질문", "a");
    await chat("B의 질문", "b");
    await chat("A의 둘째", "a");

    expect(generate.mock.calls[1][0].history).toEqual([]);
    expect(generate.mock.calls[2][0].history.map((m) => m.content)).toEqual(["A의 질문", "배터리는 약 8시간입니다"]);
    expect(messages("b")).toHaveLength(2);
  });

  it("chatId를 생략하면 default 대화에 저장된다", async () => {
    await chat("배터리는?");

    expect(messages("default")).toHaveLength(2);
  });

  it("KIMI_API_KEY가 없으면 검색 결과 JSON을 answer로 주고 sources는 비우되, 근거는 messages에 저장한다", async () => {
    vi.stubEnv("KIMI_API_KEY", "");

    const { body } = await chat("배터리는?", "chat-1");

    expect(body.success).toBe(true);
    expect(body.mode).toBe("real");
    expect(body.sources).toEqual([]);
    expect(JSON.parse(body.answer!).count).toBe(3);
    expect(generate).not.toHaveBeenCalled();
    expect((messages("chat-1")[1].sources as unknown[]).length).toBe(3);
  });

  it("답변 생성이 실패하면 messages에 아무것도 저장하지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    generate.mockRejectedValue(new Error("llm down"));

    const { res, body } = await chat("배터리는?", "chat-1");

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(messages("chat-1")).toHaveLength(0);
  });

  it("Pinecone 검색이 실패하면 일반화된 문구만 응답하고 저장하지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    services.namespace.failures.searchRecords = new Error("pinecone secret detail");

    const { res, body } = await chat("배터리는?", "chat-1");

    expect(res.status).toBe(500);
    expect(body.error).toBe("답변을 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    expect(JSON.stringify(body)).not.toContain("secret detail");
    expect(messages("chat-1")).toHaveLength(0);
    expect(generate).not.toHaveBeenCalled();
  });

  it("Supabase 대화 저장이 실패하면 일반화된 문구만 응답한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    services.supabase.failures["messages.insert"] = { code: "42501", message: "row-level security policy violated" };

    const { res, body } = await chat("배터리는?", "chat-1");

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/row-level|42501/);
  });

  it("작성일 조회가 실패해도 답변은 정상이고 작성일만 비어 있다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // 상태 확인(건수 조회)은 통과시키고, 검색된 id로 작성일을 조회하는 요청(in 필터)만 실패시킨다.
    services.supabase.filteredFailures["reviews.select"] = { code: "PGRST301", message: "temporary" };

    const { body } = await chat("배터리는?", "chat-1");

    expect(body.success).toBe(true);
    expect(body.sources?.map((s) => s.id)).toEqual(["r008", "r044", "r022"]);
    expect(body.sources?.every((s) => s.date === "")).toBe(true);
    expect(messages("chat-1")).toHaveLength(2); // 대화는 정상 저장된다
  });
});

describe("실데이터 모드: 설정 누락", () => {
  it("세 API 모두 변수 이름만 담은 오류로 500을 응답하고 외부 서비스에는 요청하지 않는다", async () => {
    for (const name of CONFIG_NAMES) vi.stubEnv(name, "");
    holder.configError = new ConfigError(["PINECONE_API_KEY", "NEXT_PUBLIC_SUPABASE_URL"]);

    const indexed = await index();
    const stat = await status();
    const asked = await chat("배터리는?");

    for (const failure of [indexed, stat, asked.body]) {
      expect(failure.success).toBe(false);
      expect(failure.error).toBe("실데이터 모드 설정이 없습니다: PINECONE_API_KEY, NEXT_PUBLIC_SUPABASE_URL");
    }
    expect(services.log).toEqual([]);
  });
});

describe("Mock 모드는 그대로다", () => {
  it("USE_MOCK이 'false'가 아니면 같은 API가 Pinecone·Supabase 없이 동작한다", async () => {
    vi.stubEnv("USE_MOCK", "true");

    const indexed = await index();
    const stat = await status();
    const asked = await chat("배터리는 얼마나 가요?", "chat-1");

    expect(indexed).toEqual({ success: true, mode: "mock", data: { indexed: 100 } });
    expect(stat.data).toEqual({ mode: "mock", indexed: true, count: 100 });
    expect(asked.body.mode).toBe("mock");
    expect(asked.body.sources!.length).toBeGreaterThan(0);
    expect(services.log).toEqual([]); // 외부 서비스 호출 0건
  });
});
