import type { ReviewRepository } from "@/lib/repository";
import {
  countRealReviews,
  getRealMessages,
  indexRealReviews,
  isRealIndexed,
  saveRealMessage,
  searchRealReviews,
} from "@/lib/review-store-real";
import type { ChatMessage, SourceReview } from "@/lib/types";

/** `review-store-real.ts`의 함수들을 `ReviewRepository` 인터페이스에 맞춰 연결하는 어댑터(Pinecone + Supabase). */
export class RealReviewRepository implements ReviewRepository {
  index(): Promise<number> {
    return indexRealReviews();
  }

  search(query: string, topK?: number): Promise<SourceReview[]> {
    return searchRealReviews(query, topK);
  }

  isIndexed(): Promise<boolean> {
    return isRealIndexed();
  }

  count(): Promise<number> {
    return countRealReviews();
  }

  appendMessage(chatId: string | undefined, message: ChatMessage): Promise<void> {
    return saveRealMessage(chatId, message);
  }

  getHistory(chatId: string | undefined, limit?: number): Promise<ChatMessage[]> {
    return getRealMessages(chatId, limit);
  }
}
