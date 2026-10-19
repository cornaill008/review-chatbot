import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigError, RealStoreError } from "@/lib/errors";
import { CsvError } from "@/lib/csv";
import {
  INDEX_WAIT_INTERVAL_MS,
  INDEX_WAIT_TIMEOUT_MS,
  PINECONE_BATCH_SIZE,
  indexRealReviews,
  waitForPineconeCount,
} from "@/lib/review-store-real";
import { createFakeServices } from "@/lib/test-support/fake-services";
import type { Review } from "@/lib/types";

// 실제 Pinecone·Supabase에는 나가지 않는다. 클라이언트를 인메모리 가짜로 바꿔 끼운다.
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

type Services = ReturnType<typeof createFakeServices>;
let services: Services;

function makeReviews(count: number, overrides: Partial<Review> = {}): Review[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `r${String(i + 1).padStart(3, "0")}`,
    rating: (i % 5) + 1,
    author: `작성자${i + 1}`,
    title: `제목${i + 1}`,
    content: `내용${i + 1}, 쉼표와 "따옴표"`,
    date: "2024-01-15",
    helpfulVotes: i,
    verifiedPurchase: true,
    ...overrides,
  }));
}

const loader = (reviews: Review[]) => async () => reviews;

/** 대기 없이 바로 끝나게 하는 옵션 (적재한 만큼 이미 보이는 상태) */
const NO_WAIT = { sleep: async () => {}, now: () => 0 };

beforeEach(() => {
  services = createFakeServices();
  holder.services = services;
  holder.configError = undefined;
});

afterEach(() => vi.restoreAllMocks());

describe("레코드와 행 구성", () => {
  it("Pinecone 레코드는 { _id, text, rating, author, title, content }뿐이고 벡터가 없다", async () => {
    await indexRealReviews(loader(makeReviews(2)), NO_WAIT);

    const [record] = services.namespace.upsertCalls[0].records;
    expect(Object.keys(record).sort()).toEqual(["_id", "author", "content", "rating", "text", "title"]);
    expect(record).toEqual({
      _id: "r001",
      text: '제목1 내용1, 쉼표와 "따옴표"',
      rating: 1,
      author: "작성자1",
      title: "제목1",
      content: '내용1, 쉼표와 "따옴표"',
    });
    expect(record).not.toHaveProperty("values");
    expect(record).not.toHaveProperty("vector");
  });

  it("text는 제목과 내용을 공백 한 칸으로 이은 값이고 rating은 숫자다", async () => {
    await indexRealReviews(loader(makeReviews(1, { title: "T", content: "C", rating: 4 })), NO_WAIT);

    const [record] = services.namespace.upsertCalls[0].records;
    expect(record.text).toBe("T C");
    expect(typeof record.rating).toBe("number");
  });

  it("upsertRecords는 배열이 아니라 { records } 객체로 호출한다 (SDK 9.x 형태)", async () => {
    await indexRealReviews(loader(makeReviews(3)), NO_WAIT);

    // 가짜 네임스페이스는 배열을 직접 받으면 실제 SDK처럼 TypeError를 던진다. 던지지 않았으므로 객체 형태다.
    expect(services.namespace.upsertCalls).toHaveLength(1);
    expect(Array.isArray(services.namespace.upsertCalls[0])).toBe(false);
    expect(services.namespace.upsertCalls[0].records).toHaveLength(3);
  });

  it("Supabase 행: id, 정수 평점, 제목, 내용, 작성자, 작성일, helpful_votes, verified_purchase", async () => {
    await indexRealReviews(loader(makeReviews(1, { rating: 4.6, helpfulVotes: 12, verifiedPurchase: true, date: "2024-02-01" })), NO_WAIT);

    const [row] = services.supabase.callsFor("reviews", "upsert")[0].payload;
    expect(row).toEqual({
      id: "r001",
      rating: 5, // 4.6 → 정수 컬럼이라 반올림
      title: "제목1",
      content: '내용1, 쉼표와 "따옴표"',
      author: "작성자1",
      date: "2024-02-01",
      helpful_votes: 12,
      verified_purchase: true,
    });
    expect(row).not.toHaveProperty("created_at"); // DB 기본값에 맡긴다
  });

  it("Pinecone 메타데이터의 평점은 반올림하지 않고 원래 숫자를 쓴다", async () => {
    await indexRealReviews(loader(makeReviews(1, { rating: 4.5 })), NO_WAIT);

    expect(services.namespace.upsertCalls[0].records[0].rating).toBe(4.5);
  });

  it("Supabase upsert는 id 기준(onConflict: 'id')이다", async () => {
    await indexRealReviews(loader(makeReviews(2)), NO_WAIT);

    expect(services.supabase.callsFor("reviews", "upsert").every((call) => call.onConflict === "id")).toBe(true);
  });
});

describe("배치", () => {
  it("100건은 96건과 4건의 두 배치로 순차 전송된다", async () => {
    await indexRealReviews(loader(makeReviews(100)), NO_WAIT);

    expect(services.namespace.upsertCalls.map((call) => call.records.length)).toEqual([96, 4]);
    expect(PINECONE_BATCH_SIZE).toBe(96);
    expect(services.log.filter((entry) => entry.startsWith("pinecone:upsertRecords"))).toEqual([
      "pinecone:upsertRecords:96",
      "pinecone:upsertRecords:4",
    ]);
  });

  it("배치는 동시에 하나만 진행된다 (병렬 전송 없음)", async () => {
    await indexRealReviews(loader(makeReviews(300)), NO_WAIT);

    expect(services.namespace.upsertCalls).toHaveLength(4); // 96 + 96 + 96 + 12
    expect(services.namespace.maxInFlightUpserts).toBe(1);
  });

  it("어떤 배치도 96건을 넘지 않는다", async () => {
    await indexRealReviews(loader(makeReviews(250)), NO_WAIT);

    expect(Math.max(...services.namespace.upsertCalls.map((call) => call.records.length))).toBeLessThanOrEqual(96);
  });

  it("정확히 96건이면 한 배치다", async () => {
    await indexRealReviews(loader(makeReviews(96)), NO_WAIT);

    expect(services.namespace.upsertCalls.map((call) => call.records.length)).toEqual([96]);
  });

  it("Supabase는 500행 이하씩 upsert한다", async () => {
    await indexRealReviews(loader(makeReviews(1200)), NO_WAIT);

    expect(services.supabase.callsFor("reviews", "upsert").map((call) => call.payload.length)).toEqual([500, 500, 200]);
    expect(services.supabase.tables.reviews).toHaveLength(1200);
  });
});

describe("호출 순서와 결과", () => {
  it("Supabase 저장이 끝난 뒤에 Pinecone에 적재하고, 마지막에 반영을 확인한다", async () => {
    await indexRealReviews(loader(makeReviews(3)), NO_WAIT);

    const log = services.log;
    expect(log.indexOf("supabase:reviews:upsert")).toBeLessThan(log.indexOf("pinecone:upsertRecords:3"));
    expect(log.lastIndexOf("pinecone:describeIndexStats")).toBeGreaterThan(log.indexOf("pinecone:upsertRecords:3"));
  });

  it("적재 건수를 돌려준다 (100건 → 100)", async () => {
    const indexed = await indexRealReviews(loader(makeReviews(100)), NO_WAIT);

    expect(indexed).toBe(100);
    expect(services.supabase.tables.reviews).toHaveLength(100);
    expect(services.namespace.records.size).toBe(100);
  });

  it("빈 CSV는 0건이고 기존 데이터를 모두 지운다", async () => {
    await indexRealReviews(loader(makeReviews(5)), NO_WAIT);

    const indexed = await indexRealReviews(loader([]), NO_WAIT);

    expect(indexed).toBe(0);
    expect(services.supabase.tables.reviews).toHaveLength(0);
    expect(services.namespace.records.size).toBe(0);
  });
});

describe("재인덱싱 (멱등)과 삭제 반영", () => {
  it("같은 CSV로 두 번 실행해도 두 저장소 모두 중복 없이 100건이다", async () => {
    await indexRealReviews(loader(makeReviews(100)), NO_WAIT);
    await indexRealReviews(loader(makeReviews(100)), NO_WAIT);

    expect(services.supabase.tables.reviews).toHaveLength(100);
    expect(new Set(services.supabase.tables.reviews.map((row) => row.id)).size).toBe(100);
    expect(services.namespace.records.size).toBe(100);
  });

  it("값이 바뀐 행은 같은 id로 갱신된다", async () => {
    await indexRealReviews(loader(makeReviews(3)), NO_WAIT);

    await indexRealReviews(loader(makeReviews(3, { title: "바뀐 제목" })), NO_WAIT);

    expect(services.supabase.tables.reviews).toHaveLength(3);
    expect(services.supabase.tables.reviews.every((row) => row.title === "바뀐 제목")).toBe(true);
    expect(services.namespace.records.get("r001")?.title).toBe("바뀐 제목");
  });

  it("CSV에서 3건이 사라지면 두 저장소 모두 97건이 되고 삭제된 id는 남지 않는다", async () => {
    await indexRealReviews(loader(makeReviews(100)), NO_WAIT);
    const shrunk = makeReviews(100).filter((review) => !["r010", "r050", "r099"].includes(review.id));

    const indexed = await indexRealReviews(loader(shrunk), NO_WAIT);

    expect(indexed).toBe(97);
    expect(services.supabase.tables.reviews).toHaveLength(97);
    expect(services.namespace.records.size).toBe(97);
    for (const id of ["r010", "r050", "r099"]) {
      expect(services.supabase.tables.reviews.some((row) => row.id === id)).toBe(false);
      expect(services.namespace.records.has(id)).toBe(false);
    }
    expect(services.namespace.deleteCalls).toEqual([{ ids: ["r010", "r050", "r099"] }]);
  });

  it("Supabase에는 없고 Pinecone에만 남은 id도 지운다 (이전 부분 실패의 잔여물)", async () => {
    services.namespace.records.set("orphan-1", { _id: "orphan-1" });

    await indexRealReviews(loader(makeReviews(3)), NO_WAIT);

    expect(services.namespace.records.has("orphan-1")).toBe(false);
    expect(services.namespace.records.size).toBe(3);
  });

  it("Pinecone에는 없고 Supabase에만 남은 id도 지운다", async () => {
    services.supabase.tables.reviews.push({ id: "orphan-2", title: "옛 리뷰" });

    await indexRealReviews(loader(makeReviews(3)), NO_WAIT);

    expect(services.supabase.tables.reviews.map((row) => row.id).sort()).toEqual(["r001", "r002", "r003"]);
  });

  it("삭제할 것이 없으면 삭제 호출을 하지 않는다", async () => {
    await indexRealReviews(loader(makeReviews(3)), NO_WAIT);
    services.log.length = 0;

    await indexRealReviews(loader(makeReviews(3)), NO_WAIT);

    expect(services.log.some((entry) => entry.includes("deleteMany") || entry === "supabase:reviews:delete")).toBe(false);
  });

  it("Pinecone id가 100개를 넘어도 페이지를 이어서 모두 읽는다", async () => {
    for (let i = 0; i < 250; i++) services.namespace.records.set(`old-${String(i).padStart(3, "0")}`, {});

    await indexRealReviews(loader(makeReviews(2)), NO_WAIT);

    expect(services.namespace.listCalls.length).toBeGreaterThanOrEqual(3);
    expect(services.namespace.records.size).toBe(2);
  });

  it("지울 id가 1000개를 넘으면 1000개 이하씩 나눠서 지운다", async () => {
    for (let i = 0; i < 2300; i++) services.namespace.records.set(`old-${String(i).padStart(4, "0")}`, {});

    await indexRealReviews(loader(makeReviews(1)), NO_WAIT);

    expect(services.namespace.deleteCalls.map((call) => call.ids?.length)).toEqual([1000, 1000, 300]);
  });
});

describe("반영 대기", () => {
  it("레코드 수가 적재 건수에 도달할 때까지 폴링하고 도달하면 바로 끝낸다", async () => {
    const counts = [0, 40, 100];
    services.namespace.visibleCount = () => counts.shift() ?? 100;
    const sleeps: number[] = [];

    await indexRealReviews(loader(makeReviews(100)), { sleep: async (ms) => void sleeps.push(ms), now: () => 0 });

    expect(services.namespace.statsCalls).toBeGreaterThanOrEqual(3); // listPaginated 이후 통계는 대기 구간에서만 센다
    expect(sleeps).toEqual([INDEX_WAIT_INTERVAL_MS, INDEX_WAIT_INTERVAL_MS]);
  });

  it("시간 안에 도달하지 않아도 적재가 성공했으면 성공으로 응답하고 경고만 남긴다", async () => {
    services.namespace.visibleCount = 0;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let clock = 0;

    const indexed = await indexRealReviews(loader(makeReviews(5)), {
      sleep: async (ms) => void (clock += ms),
      now: () => clock,
    });

    expect(indexed).toBe(5);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("반영 대기 시간 초과"));
    expect(services.supabase.tables.reviews).toHaveLength(5);
  });
});

describe("waitForPineconeCount", () => {
  it("제한 시간은 30초, 간격은 1초다", () => {
    expect(INDEX_WAIT_TIMEOUT_MS).toBe(30_000);
    expect(INDEX_WAIT_INTERVAL_MS).toBe(1_000);
  });

  it("이미 도달해 있으면 한 번만 확인하고 기다리지 않는다", async () => {
    services.namespace.visibleCount = 10;
    const sleep = vi.fn(async () => {});

    expect(await waitForPineconeCount(10, { sleep, now: () => 0 })).toBe(true);

    expect(services.namespace.statsCalls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("끝내 도달하지 않으면 30초 안에서 확인하고 false를 돌려준다", async () => {
    services.namespace.visibleCount = 0;
    let clock = 0;

    const reflected = await waitForPineconeCount(100, { sleep: async (ms) => void (clock += ms), now: () => clock });

    expect(reflected).toBe(false);
    expect(clock).toBeLessThanOrEqual(30_000);
    expect(services.namespace.statsCalls).toBe(31); // 0초, 1초, … 30초
  });

  it("대기 중 통계 조회가 실패하면 RealStoreError", async () => {
    services.namespace.failures.describeIndexStats = new Error("stats down");

    await expect(waitForPineconeCount(1, { sleep: async () => {}, now: () => 0 })).rejects.toThrow(RealStoreError);
  });
});

describe("단계별 실패", () => {
  it("CSV 오류면 어느 저장소에도 쓰지 않는다", async () => {
    const failing = async () => {
      throw new CsvError("리뷰 CSV 파일을 읽을 수 없습니다: review.csv");
    };

    await expect(indexRealReviews(failing, NO_WAIT)).rejects.toThrow(CsvError);

    expect(services.log.filter((entry) => /upsert|delete|insert/.test(entry))).toEqual([]);
  });

  it("설정이 없으면(ConfigError) CSV를 읽기 전에 멈춘다", async () => {
    holder.configError = new ConfigError(["PINECONE_API_KEY"]);
    const load = vi.fn(loader(makeReviews(2)));

    await expect(indexRealReviews(load, NO_WAIT)).rejects.toThrow(ConfigError);

    expect(load).not.toHaveBeenCalled();
    expect(services.log).toEqual([]);
  });

  it("Supabase upsert가 실패하면 RealStoreError이고 Pinecone에는 아무것도 쓰지 않는다", async () => {
    services.supabase.failures["reviews.upsert"] = { code: "42501", message: "new row violates row-level security policy" };

    const error = await indexRealReviews(loader(makeReviews(3)), NO_WAIT).catch((e) => e);

    expect(error).toBeInstanceOf(RealStoreError);
    expect(error.message).toBe("Supabase reviews upsert 실패");
    expect((error.cause as Error & { code?: string }).code).toBe("42501");
    expect(services.log.some((entry) => entry.startsWith("pinecone:upsert") || entry.startsWith("pinecone:delete"))).toBe(false);
  });

  it("Supabase 기존 id 조회가 실패하면 아무것도 쓰지 않는다", async () => {
    services.supabase.failures["reviews.select"] = { message: "boom" };

    await expect(indexRealReviews(loader(makeReviews(3)), NO_WAIT)).rejects.toThrow("Supabase reviews id 조회 실패");

    expect(services.supabase.callsFor("reviews", "upsert")).toHaveLength(0);
    expect(services.namespace.upsertCalls).toHaveLength(0);
  });

  it("Pinecone 적재가 실패하면 RealStoreError이고 Supabase에 쓴 데이터는 되돌리지 않는다", async () => {
    services.namespace.failures.upsertRecords = new Error("pinecone down");

    const error = await indexRealReviews(loader(makeReviews(3)), NO_WAIT).catch((e) => e);

    expect(error).toBeInstanceOf(RealStoreError);
    expect(error.message).toBe("Pinecone 적재 실패");
    expect(services.supabase.tables.reviews).toHaveLength(3);
    expect(services.supabase.callsFor("reviews", "delete")).toHaveLength(0);
  });

  it("Pinecone id 조회가 실패하면 삭제도 적재도 하지 않는다", async () => {
    services.namespace.failures.listPaginated = new Error("list down");

    await expect(indexRealReviews(loader(makeReviews(3)), NO_WAIT)).rejects.toThrow("Pinecone id 목록 조회 실패");

    expect(services.namespace.upsertCalls).toHaveLength(0);
    expect(services.namespace.deleteCalls).toHaveLength(0);
  });

  it("Pinecone 삭제가 실패하면 그 뒤의 적재는 하지 않는다", async () => {
    services.namespace.records.set("orphan", {});
    services.namespace.failures.deleteMany = new Error("delete down");

    await expect(indexRealReviews(loader(makeReviews(3)), NO_WAIT)).rejects.toThrow("Pinecone 삭제 실패");

    expect(services.namespace.upsertCalls).toHaveLength(0);
  });

  it("실패 후 같은 CSV로 다시 실행하면 두 저장소가 일치하게 복구된다", async () => {
    services.namespace.failures.upsertRecords = new Error("pinecone down");
    await indexRealReviews(loader(makeReviews(10)), NO_WAIT).catch(() => {});
    expect(services.namespace.records.size).toBe(0);

    services.namespace.failures = {};
    const indexed = await indexRealReviews(loader(makeReviews(10)), NO_WAIT);

    expect(indexed).toBe(10);
    expect(services.supabase.tables.reviews).toHaveLength(10);
    expect(services.namespace.records.size).toBe(10);
  });
});
