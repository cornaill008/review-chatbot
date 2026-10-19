import { CsvError } from "@/lib/csv";
import { currentMode, getRepository } from "@/lib/repository";
import type { ApiResponse, IndexResult } from "@/lib/types";

export async function POST() {
  try {
    const indexed = await getRepository().index();
    const body: ApiResponse<IndexResult> = { success: true, mode: currentMode(), data: { indexed } };
    return Response.json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "인덱싱 중 알 수 없는 오류가 발생했습니다.";
    const body: ApiResponse<IndexResult> = { success: false, error: message };
    return Response.json(body, { status: error instanceof CsvError ? 422 : 500 });
  }
}
