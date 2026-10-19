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
    expect(body).toEqual({ success: false, error: "저장소 오류" });
  });
});
