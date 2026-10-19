import { CsvError } from "@/lib/csv";
import { ConfigError, describeError } from "@/lib/errors";
import { currentMode, getRepository } from "@/lib/repository";
import type { ApiResponse, IndexResult } from "@/lib/types";

const GENERIC_ERROR = "인덱싱 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";

function fail(error: string, status: number) {
  const body: ApiResponse<IndexResult> = { success: false, error };
  return Response.json(body, { status });
}

export async function POST() {
  try {
    const indexed = await getRepository().index();
    const body: ApiResponse<IndexResult> = { success: true, mode: currentMode(), data: { indexed } };
    return Response.json(body);
  } catch (error) {
    // CSV 문제와 설정 누락(변수 이름만 담김)은 사용자가 고칠 수 있어 그대로 알린다.
    if (error instanceof CsvError) return fail(error.message, 422);
    if (error instanceof ConfigError) return fail(error.message, 500);
    // 그 밖의 오류(Pinecone·Supabase 등)는 서비스의 오류 본문이 새지 않도록 일반화된 문구만 응답하고 로그에만 남긴다.
    console.error("[api/index-data] 인덱싱 실패:", describeError(error));
    return fail(GENERIC_ERROR, 500);
  }
}
