import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 요청 컨텍스트 밖에서는 connection()을 호출할 수 없으므로 대체한다.
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

import { GET } from "@/app/api/status/route";
import * as repositoryModule from "@/lib/repository";
import { MockReviewRepository } from "@/lib/repository/mock";
import { resetMockStore } from "@/lib/review-store";
import type { ApiResponse, Review, StatusData } from "@/lib/types";

const review = (id: number, title: string, content: string): Review => ({
  id: `review-${id}`,
  rating: 4,
  author: "작성자",
  title,
  content,
  date: "2024-01-01",
  helpfulVotes: 0,
  verifiedPurchase: false,
});

const fixture: Review[] = [review(1, "배터리", "오래 가요"), review(2, "음질", "보통이에요"), review(3, "착용감", "편해요")];

async function status() {
  const res = await GET();
  return { res, body: (await res.json()) as ApiResponse<StatusData> };
}

beforeEach(() => resetMockStore());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/status", () => {
  it("인덱싱 전에는 mock, indexed:false, count:0", async () => {
    vi.stubEnv("USE_MOCK", undefined);

    const { res, body } = await status();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, data: { mode: "mock", indexed: false, count: 0 } });
  });

  it("인덱싱 후에는 indexed:true와 적재 건수를 돌려준다", async () => {
    await new MockReviewRepository(async () => fixture).index();

    const { body } = await status();

    expect(body.data).toEqual({ mode: "mock", indexed: true, count: 3 });
  });

  it("USE_MOCK='false'이고 저장소가 동작하면 mode는 real이다", async () => {
    vi.stubEnv("USE_MOCK", "false");
    vi.spyOn(repositoryModule, "getRepository").mockReturnValue({
      isIndexed: async () => true,
      count: async () => 42,
    } as unknown as repositoryModule.ReviewRepository);

    const { body } = await status();

    expect(body.data).toEqual({ mode: "real", indexed: true, count: 42 });
  });

  it("저장소 접근에 실패하면 500과 success:false", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(repositoryModule, "getRepository").mockImplementation(() => {
      throw new Error("저장소 오류");
    });

    const { res, body } = await status();

    expect(res.status).toBe(500);
    // 서비스의 오류 메시지는 응답에 싣지 않고 일반화된 문구만 보낸다.
    expect(body).toEqual({ success: false, error: "상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    expect(JSON.stringify(body)).not.toContain("저장소 오류");
  });

  it("실데이터 모드에서 설정이 없으면 빠진 변수의 이름만 담아 500으로 응답한다", async () => {
    vi.stubEnv("USE_MOCK", "false");
    for (const name of [
      "PINECONE_API_KEY",
      "PINECONE_INDEX_NAME",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]) {
      vi.stubEnv(name, "");
    }

    const { res, body } = await status();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toContain("실데이터 모드 설정이 없습니다");
    expect(body.error).toContain("PINECONE_API_KEY");
  });

  it("외부 서비스 오류의 로그에는 키 값이 남지 않는다", async () => {
    vi.stubEnv("PINECONE_API_KEY", "pcsk_status_secret_1234567890");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(repositoryModule, "getRepository").mockImplementation(() => {
      throw new Error("bad key pcsk_status_secret_1234567890");
    });

    await status();

    const logText = logged.mock.calls.flat().map(String).join(" ");
    expect(logText).toContain("[PINECONE_API_KEY]");
    expect(logText).not.toContain("pcsk_status_secret_1234567890");
  });
});
