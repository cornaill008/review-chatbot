import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 파일 없음 같은 실패는 CSV 로더에 주입한다. 기본은 실제 samples/review.csv를 읽는다.
vi.mock("@/lib/csv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/csv")>();
  return { ...actual, loadReviews: vi.fn(actual.loadReviews) };
});

import { POST } from "@/app/api/index-data/route";
import { CsvError, loadReviews } from "@/lib/csv";
import { countMockReviews, resetMockStore } from "@/lib/review-store";
import type { ApiResponse, IndexResult } from "@/lib/types";

async function post() {
  const res = await POST();
  return { res, body: (await res.json()) as ApiResponse<IndexResult> };
}

beforeEach(() => resetMockStore());
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/index-data", () => {
  it("samples/review.csv 100건을 적재하고 { success, mode: 'mock', data: { indexed: 100 } }를 반환한다", async () => {
    vi.stubEnv("USE_MOCK", undefined);

    const { res, body } = await post();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, mode: "mock", data: { indexed: 100 } });
    expect(await countMockReviews()).toBe(100);
  });

  it("이전 필드(data.count)는 더 이상 내려주지 않는다", async () => {
    const { body } = await post();

    expect(body.data).not.toHaveProperty("count");
  });

  it("재인덱싱해도 100건이다 (중복 적재 없음)", async () => {
    await post();
    const { body } = await post();

    expect(body.data?.indexed).toBe(100);
    expect(await countMockReviews()).toBe(100);
  });

  it("CSV를 읽을 수 없으면 422와 success:false, 원인 문자열을 반환하고 mode는 싣지 않는다", async () => {
    vi.mocked(loadReviews).mockRejectedValueOnce(new CsvError("리뷰 CSV 파일을 읽을 수 없습니다: review.csv"));

    const { res, body } = await post();

    expect(res.status).toBe(422);
    expect(body).toEqual({ success: false, error: "리뷰 CSV 파일을 읽을 수 없습니다: review.csv" });
  });

  it("실패한 재인덱싱은 기존 적재를 지우지 않는다", async () => {
    await post();
    vi.mocked(loadReviews).mockRejectedValueOnce(new CsvError("실패"));

    await post();

    expect(await countMockReviews()).toBe(100);
  });

  it("USE_MOCK='false'이면 아직 구현되지 않았다는 오류(500)를 반환한다", async () => {
    vi.stubEnv("USE_MOCK", "false");

    const { res, body } = await post();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/구현되지 않았습니다/);
  });
});
