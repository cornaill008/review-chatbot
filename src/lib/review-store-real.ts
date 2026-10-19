/**
 * 실데이터 모드(`USE_MOCK=false`)의 데이터 접근 함수 모음. `review-store.ts`(Mock)와 짝이다.
 *
 * - 리뷰 원본과 대화 기록: Supabase(`reviews`, `messages`)
 * - 의미 검색: Pinecone 통합 임베딩 인덱스. 임베딩 벡터는 클라이언트에서 만들지 않고 텍스트를 그대로 넘긴다.
 *   CLAUDE.md에 따라 `upsertRecords`/`searchRecords`를 직접 호출한다(PineconeStore·임베딩 라이브러리 금지).
 */
import type { PostgrestError } from "@supabase/supabase-js";
import { normalizeChatId } from "@/lib/chat-id";
import { REVIEW_NAMESPACE, getReviewNamespace, getSupabase } from "@/lib/clients";
import { loadReviews } from "@/lib/csv";
import { RealStoreError, describeError } from "@/lib/errors";
import { DEFAULT_TOP_K, toDisplayScore } from "@/lib/search";
import type { ChatMessage, Review, SourceReview } from "@/lib/types";

/** Pinecone 통합 임베딩은 한 번에 96개 이하만 받는다. */
export const PINECONE_BATCH_SIZE = 96;
export const SUPABASE_UPSERT_CHUNK = 500;
/** `.in('id', …)`는 URL에 들어가므로 길이를 줄이기 위해 작게 나눈다. */
export const SUPABASE_DELETE_CHUNK = 100;
export const PINECONE_DELETE_CHUNK = 1000;
/** 한 번에 읽는 id 수 (PostgREST 기본 상한이 1000행) */
const ID_PAGE_SIZE = 1000;
export const INDEX_WAIT_TIMEOUT_MS = 30_000;
export const INDEX_WAIT_INTERVAL_MS = 1_000;

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** PostgrestError는 Error가 아니라서 로그 설명(describeError)이 읽을 수 있게 Error로 감싼다. */
function toCause(error: PostgrestError | { code?: string; message: string }): Error {
  return Object.assign(new Error(error.message), { name: "PostgrestError", code: error.code });
}

function supabaseOk<T extends { error: PostgrestError | { code?: string; message: string } | null }>(
  label: string,
  result: T,
): T {
  if (result.error) throw new RealStoreError(`Supabase ${label} 실패`, { cause: toCause(result.error) });
  return result;
}

async function pinecone<T>(label: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw new RealStoreError(`Pinecone ${label} 실패`, { cause: error });
  }
}

// ───────────────────────── 변환 ─────────────────────────

function toSupabaseRow(review: Review) {
  return {
    id: review.id,
    rating: Math.round(review.rating), // DB 컬럼은 정수다.
    title: review.title,
    content: review.content,
    author: review.author,
    date: review.date,
    helpful_votes: review.helpfulVotes,
    verified_purchase: review.verifiedPurchase,
  };
}

/** CLAUDE.md의 적재 레코드 형태. `text`가 임베딩 대상 필드다. */
function toPineconeRecord(review: Review) {
  return {
    _id: review.id,
    text: `${review.title} ${review.content}`,
    rating: Number(review.rating),
    author: review.author,
    title: review.title,
    content: review.content,
  };
}

// ───────────────────────── 현재 저장 상태 읽기 ─────────────────────────

async function listSupabaseIds(): Promise<string[]> {
  const supabase = getSupabase();
  const ids: string[] = [];
  for (let from = 0; ; from += ID_PAGE_SIZE) {
    const { data } = supabaseOk(
      "reviews id 조회",
      await supabase.from("reviews").select("id").range(from, from + ID_PAGE_SIZE - 1),
    );
    const page = (data ?? []) as Array<{ id: string }>;
    ids.push(...page.map((row) => row.id));
    if (page.length < ID_PAGE_SIZE) return ids;
  }
}

async function listPineconeIds(): Promise<string[]> {
  const ns = getReviewNamespace();
  const ids: string[] = [];
  let paginationToken: string | undefined;
  do {
    const page = await pinecone("id 목록 조회", () => ns.listPaginated({ limit: 100, paginationToken }));
    ids.push(...(page.vectors ?? []).map((vector) => String(vector.id)));
    paginationToken = page.pagination?.next;
  } while (paginationToken);
  return ids;
}

async function countPineconeRecords(): Promise<number> {
  const ns = getReviewNamespace();
  const stats = await pinecone("통계 조회", () => ns.describeIndexStats());
  return stats.namespaces?.[REVIEW_NAMESPACE]?.recordCount ?? 0;
}

/** 적재 직후 Pinecone이 검색·통계에 바로 반영하지 않을 수 있어, 레코드 수가 도달할 때까지 기다린다. */
export async function waitForPineconeCount(expected: number, options: WaitOptions = {}): Promise<boolean> {
  const { timeoutMs = INDEX_WAIT_TIMEOUT_MS, intervalMs = INDEX_WAIT_INTERVAL_MS, sleep = defaultSleep, now = Date.now } = options;
  const deadline = now() + timeoutMs;
  for (;;) {
    if ((await countPineconeRecords()) >= expected) return true;
    if (now() + intervalMs > deadline) return false;
    await sleep(intervalMs);
  }
}

// ───────────────────────── 인덱싱 ─────────────────────────

/**
 * CSV를 Supabase `reviews`와 Pinecone `reviews` 네임스페이스에 적재하고 건수를 돌려준다.
 * 같은 CSV로 다시 실행해도 같은 상태가 되며(멱등), CSV에서 사라진 id는 양쪽에서 지운다.
 * 단계 사이에서 실패하면 되돌리지 않고 오류를 던진다. 다시 실행하면 복구된다.
 */
export async function indexRealReviews(
  load: () => Promise<Review[]> = loadReviews,
  wait: WaitOptions = {},
): Promise<number> {
  // 설정이 없으면 외부 요청이나 CSV 읽기 전에 ConfigError로 멈춘다.
  const supabase = getSupabase();
  const ns = getReviewNamespace();

  const reviews = await load(); // CSV 오류(CsvError)면 어느 저장소에도 쓰지 않는다.
  const keep = new Set(reviews.map((review) => review.id));

  // 1) Supabase(원본)
  const staleSupabase = (await listSupabaseIds()).filter((id) => !keep.has(id));
  for (const rows of chunk(reviews.map(toSupabaseRow), SUPABASE_UPSERT_CHUNK)) {
    supabaseOk("reviews upsert", await supabase.from("reviews").upsert(rows, { onConflict: "id" }));
  }
  for (const ids of chunk(staleSupabase, SUPABASE_DELETE_CHUNK)) {
    supabaseOk("reviews 삭제", await supabase.from("reviews").delete().in("id", ids));
  }

  // 2) Pinecone(검색 색인). Supabase와 따로 어긋나 있을 수 있어 자기 쪽 id 목록으로 정리한다.
  const stalePinecone = (await listPineconeIds()).filter((id) => !keep.has(id));
  for (const ids of chunk(stalePinecone, PINECONE_DELETE_CHUNK)) {
    await pinecone("삭제", () => ns.deleteMany({ ids }));
  }
  // 96개 이하씩 순차로 보낸다(병렬이면 임베딩 추론 속도 제한에 걸릴 수 있다).
  for (const records of chunk(reviews.map(toPineconeRecord), PINECONE_BATCH_SIZE)) {
    await pinecone("적재", () => ns.upsertRecords({ records }));
  }

  // 3) 반영 대기. 시간이 지나도 적재는 성공했으므로 성공으로 응답한다.
  const reflected = await waitForPineconeCount(reviews.length, wait);
  if (!reflected) console.warn(`[real] Pinecone 반영 대기 시간 초과: ${reviews.length}건이 아직 모두 보이지 않습니다.`);

  return reviews.length;
}

// ───────────────────────── 검색 ─────────────────────────

/** 검색 결과 id의 작성일을 Supabase에서 가져온다. 부가 정보라 실패해도 검색은 계속한다. */
async function fetchDates(ids: string[]): Promise<Map<string, string>> {
  const dates = new Map<string, string>();
  try {
    const { data } = supabaseOk("reviews 작성일 조회", await getSupabase().from("reviews").select("id,date").in("id", ids));
    for (const row of (data ?? []) as Array<{ id: string; date: string | null }>) dates.set(row.id, row.date ?? "");
  } catch (error) {
    console.warn("[real] 작성일 조회 실패(작성일 없이 계속):", describeError(error));
  }
  return dates;
}

export async function searchRealReviews(query: string, topK: number = DEFAULT_TOP_K): Promise<SourceReview[]> {
  const ns = getReviewNamespace();
  const response = await pinecone("검색", () =>
    ns.searchRecords({
      query: { topK, inputs: { text: query } },
      fields: ["title", "content", "rating", "author"],
    }),
  );

  const hits = response.result?.hits ?? [];
  if (hits.length === 0) return [];

  const dates = await fetchDates(hits.map((hit) => hit._id));
  return hits.map((hit) => {
    const fields = (hit.fields ?? {}) as Record<string, unknown>;
    return {
      id: hit._id,
      title: String(fields.title ?? ""),
      content: String(fields.content ?? ""),
      rating: Number(fields.rating) || 0,
      author: String(fields.author ?? ""),
      date: dates.get(hit._id) ?? "",
      score: toDisplayScore(hit._score), // Pinecone 순위를 그대로 유지한다(단조 변환).
    };
  });
}

// ───────────────────────── 대화 기록 ─────────────────────────

export async function saveRealMessage(chatId: string | undefined, message: ChatMessage): Promise<void> {
  const row = {
    chat_id: normalizeChatId(chatId),
    role: message.role,
    content: message.content,
    ...(message.sources ? { sources: message.sources } : {}),
  };
  supabaseOk("messages 저장", await getSupabase().from("messages").insert(row));
}

/** 최근 `limit`개 메시지를 시간순으로 돌려준다(limit이 없으면 읽을 수 있는 전체). */
export async function getRealMessages(chatId: string | undefined, limit?: number): Promise<ChatMessage[]> {
  let query = getSupabase()
    .from("messages")
    .select("role,content")
    .eq("chat_id", normalizeChatId(chatId))
    .order("created_at", { ascending: false });
  if (limit !== undefined) query = query.limit(limit);

  const { data } = supabaseOk("messages 조회", await query);
  return ((data ?? []) as Array<{ role: string; content: string }>)
    .filter((row) => row.role === "user" || row.role === "assistant")
    .reverse()
    .map((row) => ({ role: row.role as ChatMessage["role"], content: row.content }));
}

// ───────────────────────── 상태 ─────────────────────────

export async function countRealReviews(): Promise<number> {
  const { count } = supabaseOk(
    "reviews 건수 조회",
    await getSupabase().from("reviews").select("id", { count: "exact", head: true }),
  );
  return count ?? 0;
}

/** Supabase와 Pinecone 양쪽에 모두 적재되어 있어야 인덱싱된 것으로 본다. */
export async function isRealIndexed(): Promise<boolean> {
  const [reviews, records] = await Promise.all([countRealReviews(), countPineconeRecords()]);
  return reviews > 0 && records > 0;
}
