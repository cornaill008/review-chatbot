import { HISTORY_LIMIT, MissingApiKeyError, generateAnswer, hasApiKey } from "@/lib/chain";
import { ConfigError, describeError } from "@/lib/errors";
import { currentMode, getRepository } from "@/lib/repository";
import { formatRetrievalJson } from "@/lib/retrieval-json";
import { DEFAULT_TOP_K } from "@/lib/search";
import type { ChatResponse } from "@/lib/types";

const MAX_CHAT_ID_LENGTH = 100;

type ParsedRequest = { ok: true; query: string; chatId: string | undefined } | { ok: false; error: string };

function fail(error: string, status: number) {
  const body: ChatResponse = { success: false, error };
  return Response.json(body, { status });
}

/** 본문에서 `{ query, chatId? }`를 읽는다. 이전 형식의 `message`는 받지 않는다. */
async function parseRequest(request: Request): Promise<ParsedRequest> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, error: "query를 입력해 주세요." };
  }

  const { query, chatId } = (body ?? {}) as { query?: unknown; chatId?: unknown };
  if (typeof query !== "string" || query.trim() === "") {
    return { ok: false, error: "query를 입력해 주세요." };
  }

  if (chatId === undefined || chatId === null) return { ok: true, query: query.trim(), chatId: undefined };
  if (typeof chatId !== "string" || chatId.trim().length > MAX_CHAT_ID_LENGTH) {
    return { ok: false, error: `chatId는 ${MAX_CHAT_ID_LENGTH}자 이하의 문자열이어야 합니다.` };
  }
  return { ok: true, query: query.trim(), chatId: chatId.trim() || undefined };
}

export async function POST(request: Request) {
  const parsed = await parseRequest(request);
  if (!parsed.ok) return fail(parsed.error, 400);
  const { query, chatId } = parsed;

  try {
    const repository = getRepository();
    if (!(await repository.isIndexed())) {
      return fail("먼저 [샘플 데이터 인덱싱]을 실행해 주세요.", 409);
    }

    const sources = await repository.search(query, DEFAULT_TOP_K);

    // API 키가 없으면 답변 생성을 생략하고 검색 결과를 JSON으로 돌려준다(sources는 JSON 안에 있다).
    const skipGeneration = !hasApiKey();
    const answer = skipGeneration
      ? formatRetrievalJson(query, sources)
      : await generateAnswer({
          question: query,
          sources,
          history: await repository.getHistory(chatId, HISTORY_LIMIT),
        });

    // 성공했을 때만 질문과 답변을 함께 저장한다.
    await repository.appendMessage(chatId, { role: "user", content: query });
    await repository.appendMessage(chatId, { role: "assistant", content: answer, sources });

    const body: ChatResponse = {
      success: true,
      mode: currentMode(),
      answer,
      sources: skipGeneration ? [] : sources,
    };
    return Response.json(body);
  } catch (error) {
    // 키 누락·설정 누락은 변수 이름만 담겨 있어 그대로 알린다. 그 밖의 오류는 일반화된 문구만 응답한다.
    if (error instanceof MissingApiKeyError || error instanceof ConfigError) return fail(error.message, 500);
    console.error("[api/chat] 답변 생성 실패:", describeError(error));
    return fail("답변을 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }
}
