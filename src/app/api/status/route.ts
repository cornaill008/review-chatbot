import { connection } from "next/server";
import { ConfigError, describeError } from "@/lib/errors";
import { currentMode, getRepository } from "@/lib/repository";
import type { ApiResponse, StatusData } from "@/lib/types";

const GENERIC_ERROR = "상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.";

function fail(error: string) {
  const body: ApiResponse<StatusData> = { success: false, error };
  return Response.json(body, { status: 500 });
}

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
    // 설정 누락은 변수 이름만 담겨 있어 그대로 알리고, 그 밖의 오류는 일반화된 문구만 응답한다.
    if (error instanceof ConfigError) return fail(error.message);
    console.error("[api/status] 상태 조회 실패:", describeError(error));
    return fail(GENERIC_ERROR);
  }
}
