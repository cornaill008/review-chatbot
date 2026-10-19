import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 파일 없음 같은 실패는 CSV 로더에 주입한다. 기본은 실제 samples/review.csv를 읽는다.
vi.mock("@/lib/csv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/csv")>();
  return { ...actual, loadReviews: vi.fn(actual.loadReviews) };
});

import { POST } from "@/app/api/index-data/route";
import { CsvError, loadReviews } from "@/lib/csv";
import * as repositoryModule from "@/lib/repository";
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

  describe("실데이터 모드의 오류 응답", () => {
    const CONFIG_NAMES = [
      "PINECONE_API_KEY",
      "PINECONE_INDEX_NAME",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ];

    it("설정이 없으면 500과 빠진 변수의 이름만 담긴 오류를 돌려주고 외부에 요청하지 않는다", async () => {
      vi.stubEnv("USE_MOCK", "false");
      for (const name of CONFIG_NAMES) vi.stubEnv(name, "");

      const { res, body } = await post();

      expect(res.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toBe(
        "실데이터 모드 설정이 없습니다: PINECONE_API_KEY, PINECONE_INDEX_NAME, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      );
    });

    it("Pinecone·Supabase 오류는 서비스의 오류 본문 없이 일반화된 문구만 응답한다", async () => {
      vi.stubEnv("USE_MOCK", "false");
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(repositoryModule, "getRepository").mockReturnValue({
        index: async () => {
          throw Object.assign(new Error("Supabase 상세: relation public.reviews policy detail xyz"), { status: 403 });
        },
      } as unknown as repositoryModule.ReviewRepository);

      const { res, body } = await post();

      expect(res.status).toBe(500);
      expect(body).toEqual({ success: false, error: "인덱싱 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." });
      expect(JSON.stringify(body)).not.toMatch(/Supabase|policy|xyz|403/);
    });

    it("서버 로그에는 오류 이름·상태·메시지를 남기되 키 값은 가린다", async () => {
      vi.stubEnv("USE_MOCK", "false");
      vi.stubEnv("PINECONE_API_KEY", "pcsk_secret_value_1234567890");
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(repositoryModule, "getRepository").mockReturnValue({
        index: async () => {
          throw Object.assign(new Error("Unauthorized: key=pcsk_secret_value_1234567890"), { status: 401 });
        },
      } as unknown as repositoryModule.ReviewRepository);

      const { body } = await post();

      const logText = logged.mock.calls.flat().map(String).join(" ");
      expect(logText).toContain("HTTP 401");
      expect(logText).toContain("[PINECONE_API_KEY]");
      expect(logText).not.toContain("pcsk_secret_value_1234567890");
      expect(JSON.stringify(body)).not.toContain("pcsk_secret_value_1234567890");
    });

    it("성공하면 mode: 'real'과 적재 건수를 돌려준다", async () => {
      vi.stubEnv("USE_MOCK", "false");
      vi.spyOn(repositoryModule, "getRepository").mockReturnValue({
        index: async () => 100,
      } as unknown as repositoryModule.ReviewRepository);

      const { res, body } = await post();

      expect(res.status).toBe(200);
      expect(body).toEqual({ success: true, mode: "real", data: { indexed: 100 } });
    });

    it("CSV 오류는 실데이터 모드에서도 Mock 모드와 같은 422 응답이다", async () => {
      vi.stubEnv("USE_MOCK", "false");
      vi.spyOn(repositoryModule, "getRepository").mockReturnValue({
        index: async () => {
          throw new CsvError("리뷰 CSV 파일을 읽을 수 없습니다: review.csv");
        },
      } as unknown as repositoryModule.ReviewRepository);

      const { res, body } = await post();

      expect(res.status).toBe(422);
      expect(body).toEqual({ success: false, error: "리뷰 CSV 파일을 읽을 수 없습니다: review.csv" });
    });
  });

  it("Mock 모드에서도 CSV 외의 예기치 못한 오류는 일반화된 문구만 응답한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(repositoryModule, "getRepository").mockReturnValue({
      index: async () => {
        throw new Error("내부 상세 내용");
      },
    } as unknown as repositoryModule.ReviewRepository);

    const { res, body } = await post();

    expect(res.status).toBe(500);
    expect(body.error).not.toContain("내부 상세");
  });
});
