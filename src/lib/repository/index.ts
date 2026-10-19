import type { ChatMessage, DataMode, SourceReview } from "@/lib/types";
import { MockReviewRepository } from "@/lib/repository/mock";
import { RealReviewRepository } from "@/lib/repository/real";

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
let realRepository: ReviewRepository | undefined;

/**
 * 데이터 모드에 맞는 저장소를 돌려주는 유일한 분기점이다. 라우트와 UI는 모드를 모른다.
 * 환경변수는 호출할 때마다 읽는다(`USE_MOCK`을 바꿔도 다음 호출부터 반영된다).
 * 실데이터 저장소는 객체를 만들 때 외부 서비스에 접속하지 않으며, 각 메서드를 처음 쓸 때 설정을 검증한다.
 */
export function getRepository(): ReviewRepository {
  if (!isMockMode()) {
    realRepository ??= new RealReviewRepository();
    return realRepository;
  }
  mockRepository ??= new MockReviewRepository();
  return mockRepository;
}
