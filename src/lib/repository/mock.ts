import { loadReviews } from "@/lib/csv";
import type { ReviewRepository } from "@/lib/repository";
import {
  countMockReviews,
  getMockMessages,
  indexMockReviews,
  isMockIndexed,
  saveMockMessage,
  searchMockReviews,
} from "@/lib/review-store";
import type { ChatMessage, Review, SourceReview } from "@/lib/types";

/** `review-store.ts`의 Mock 함수들을 `ReviewRepository` 인터페이스에 맞춰 연결하는 어댑터. */
export class MockReviewRepository implements ReviewRepository {
  constructor(private readonly load: () => Promise<Review[]> = loadReviews) {}

  index(): Promise<number> {
    return indexMockReviews(this.load);
  }

  search(query: string, topK?: number): Promise<SourceReview[]> {
    return searchMockReviews(query, topK);
  }

  isIndexed(): Promise<boolean> {
    return isMockIndexed();
  }

  count(): Promise<number> {
    return countMockReviews();
  }

  appendMessage(chatId: string | undefined, message: ChatMessage): Promise<void> {
    return saveMockMessage(chatId, message);
  }

  getHistory(chatId: string | undefined, limit?: number): Promise<ChatMessage[]> {
    return getMockMessages(chatId, limit);
  }
}
