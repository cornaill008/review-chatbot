import type {
  ApiResponse,
  ChatResponse,
  IndexResult,
  SourceReview,
  StatusData,
} from "@/lib/types";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ChatAnswer {
  answer: string;
  sources: SourceReview[];
}

const NETWORK_ERROR = "서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.";
const PARSE_ERROR = "서버 응답을 해석할 수 없습니다.";
const UNKNOWN_ERROR = "알 수 없는 오류가 발생했습니다.";

/** fetch 실패, JSON 파싱 실패를 모두 `{ ok: false }`로 바꿔 컴포넌트가 예외를 다루지 않게 한다. */
async function request<B extends { success: boolean; error?: string }>(
  input: string,
  init?: RequestInit,
): Promise<{ ok: true; body: B } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }

  let body: B;
  try {
    body = (await response.json()) as B;
  } catch {
    return { ok: false, error: PARSE_ERROR };
  }

  if (!body || body.success !== true) {
    return { ok: false, error: body?.error || UNKNOWN_ERROR };
  }
  return { ok: true, body };
}

export async function getStatus(): Promise<ApiResult<StatusData>> {
  const result = await request<ApiResponse<StatusData>>("/api/status", { cache: "no-store" });
  if (!result.ok) return result;
  return result.body.data ? { ok: true, data: result.body.data } : { ok: false, error: PARSE_ERROR };
}

export async function runIndexing(): Promise<ApiResult<IndexResult>> {
  const result = await request<ApiResponse<IndexResult>>("/api/index-data", { method: "POST" });
  if (!result.ok) return result;
  const indexed = result.body.data?.indexed;
  return typeof indexed === "number" ? { ok: true, data: { indexed } } : { ok: false, error: PARSE_ERROR };
}

/** `chatId`를 같게 보내면 서버가 같은 대화의 이전 질문·답변을 문맥으로 쓴다. */
export async function sendChat(query: string, chatId?: string): Promise<ApiResult<ChatAnswer>> {
  const result = await request<ChatResponse>("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, chatId }), // chatId가 undefined면 JSON에서 생략된다
  });
  if (!result.ok) return result;
  const { answer, sources } = result.body;
  return typeof answer === "string"
    ? { ok: true, data: { answer, sources: sources ?? [] } }
    : { ok: false, error: PARSE_ERROR };
}
