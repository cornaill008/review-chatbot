/**
 * Mock 모드(`USE_MOCK !== 'false'`)의 데이터 접근 함수 모음.
 *
 * 4단계(`USE_MOCK=false`)에서는 짝이 되는 `review-store-real.ts`
 * (`indexRealReviews`, `searchRealReviews`, `saveRealMessage`, `getRealMessages`)를 추가하고
 * `repository/index.ts`의 팩토리에서 어댑터만 바꿔 끼운다. 라우트와 UI는 이 파일을 직접 알지 못한다.
 */
import { loadReviews } from "@/lib/csv";
import { DEFAULT_TOP_K, searchReviews } from "@/lib/search";
import type { ChatMessage, Review, SourceReview } from "@/lib/types";

export const DEFAULT_CHAT_ID = "default";
export const MAX_MESSAGES_PER_CHAT = 200;
export const MAX_CHATS = 100;

interface MockStore {
  reviews: Review[];
  indexed: boolean;
  /** 삽입 순서 = 최근에 저장한 순서(가장 오래된 대화가 맨 앞). */
  chats: Map<string, ChatMessage[]>;
}

const globalForStore = globalThis as typeof globalThis & { __mockReviewStore?: MockStore };

/**
 * 개발 모드(HMR)와 라우트별 번들링에서도 `/api/index-data`와 `/api/chat`이
 * 같은 상태를 보도록 globalThis에 보관한다.
 */
function getStore(): MockStore {
  globalForStore.__mockReviewStore ??= { reviews: [], indexed: false, chats: new Map() };
  return globalForStore.__mockReviewStore;
}

function normalizeChatId(chatId: string | undefined): string {
  return chatId?.trim() || DEFAULT_CHAT_ID;
}

/** `samples/review.csv`를 읽어 메모리에 적재(재인덱싱이면 대체)하고 적재 건수를 반환한다. */
export async function indexMockReviews(load: () => Promise<Review[]> = loadReviews): Promise<number> {
  const reviews = await load(); // 실패하면 기존 상태를 건드리지 않는다.
  const store = getStore();
  store.reviews = reviews;
  store.indexed = true;
  return reviews.length;
}

export async function searchMockReviews(query: string, topK: number = DEFAULT_TOP_K): Promise<SourceReview[]> {
  return searchReviews(getStore().reviews, query, topK);
}

export async function isMockIndexed(): Promise<boolean> {
  return getStore().indexed;
}

export async function countMockReviews(): Promise<number> {
  return getStore().reviews.length;
}

/** 메시지를 `chatId`의 대화 끝에 추가한다. `chatId`가 없으면 기본 대화를 쓴다. */
export async function saveMockMessage(chatId: string | undefined, message: ChatMessage): Promise<void> {
  const { chats } = getStore();
  const id = normalizeChatId(chatId);

  const messages = chats.get(id) ?? [];
  chats.delete(id); // 삭제 후 다시 넣어 "가장 최근에 저장한 대화"를 맨 뒤로 보낸다.
  messages.push(message);
  if (messages.length > MAX_MESSAGES_PER_CHAT) messages.splice(0, messages.length - MAX_MESSAGES_PER_CHAT);
  chats.set(id, messages);

  while (chats.size > MAX_CHATS) {
    const oldest = chats.keys().next().value;
    if (oldest === undefined) break;
    chats.delete(oldest);
  }
}

/** `chatId` 대화의 최근 `limit`개 메시지를 시간순으로 반환한다(limit이 없으면 전체). 복사본을 돌려준다. */
export async function getMockMessages(chatId: string | undefined, limit?: number): Promise<ChatMessage[]> {
  const messages = getStore().chats.get(normalizeChatId(chatId)) ?? [];
  return limit === undefined ? [...messages] : messages.slice(-limit);
}

/** 테스트에서 전역 스토어를 초기화한다. */
export function resetMockStore(): void {
  globalForStore.__mockReviewStore = undefined;
}
