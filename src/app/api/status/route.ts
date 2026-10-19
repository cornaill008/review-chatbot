import { connection } from "next/server";
import { currentMode, getRepository } from "@/lib/repository";
import type { ApiResponse, StatusData } from "@/lib/types";

export async function GET() {
  // cacheComponents 환경에서는 런타임 데이터를 읽지 않는 GET이 빌드 시점에 프리렌더될 수 있다.
  // 모드와 인덱싱 상태는 요청 시점 값이어야 하므로 요청 시점 실행을 명시한다.
  await connection();

  try {
    const repository = getRepository();
    const [indexed, count] = await Promise.all([repository.isIndexed(), repository.count()]);
    const body: ApiResponse<StatusData> = {
      success: true,
      data: { mode: currentMode(), indexed, count },
    };
    return Response.json(body);
  } catch (error) {
    console.error("[api/status] 상태 조회 실패", error);
    const body: ApiResponse<StatusData> = {
      success: false,
      error: error instanceof Error ? error.message : "상태를 확인하지 못했습니다.",
    };
    return Response.json(body, { status: 500 });
  }
}
