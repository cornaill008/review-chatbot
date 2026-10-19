import type { ChatMessage, DataMode, SourceReview } from "@/lib/types";
import { MockReviewRepository } from "@/lib/repository/mock";

export interface ReviewRepository {
  /** 리뷰 데이터를 (재)적재하고 적재 건수를 반환한다. */
  index(): Promise<number>;
  /** 질문과 관련된 리뷰를 점수 순으로 최대 topK건 반환한다. */
  search(query: string, topK?: number): Promise<SourceReview[]>;
  isIndexed(): Promise<boolean>;
  count(): Promise<number>;
  /** `chatId` 대화에 메시지를 추가한다. `chatId`가 없으면 기본 대화를 쓴다. */
  appendMessage(chatId: string | undefined, message: ChatMessage): Promise<void>;
  /** `chatId` 대화의 최근 limit개 메시지를 시간순으로 반환한다. limit이 없으면 전체. */
  getHistory(chatId: string | undefined, limit?: number): Promise<ChatMessage[]>;
}

/** `USE_MOCK`이 'false'가 아닌 모든 경우 Mock Mode. */
export function isMockMode(): boolean {
  return process.env.USE_MOCK !== "false";
}

/** 응답의 `mode` 필드와 상태 API가 쓰는 현재 데이터 모드. */
export function currentMode(): DataMode {
  return isMockMode() ? "mock" : "real";
}

let mockRepository: ReviewRepository | undefined;

export function getRepository(): ReviewRepository {
  if (!isMockMode()) {
    throw new Error("실데이터 모드(USE_MOCK=false)는 아직 구현되지 않았습니다.");
  }
  mockRepository ??= new MockReviewRepository();
  return mockRepository;
}
