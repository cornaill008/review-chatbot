export type DataMode = "mock" | "real";

export interface Review {
  id: string;
  rating: number;
  author: string;
  title: string;
  content: string;
  /** CSV의 작성일 문자열 그대로 */
  date: string;
  /** CSV `helpful_votes`를 정수로 변환한 값(변환할 수 없으면 0) */
  helpfulVotes: number;
  /** CSV `verified_purchase`가 `true`(대소문자 무시)이면 true, 그 외·누락이면 false */
  verifiedPurchase: boolean;
}

/** 검색 결과로 응답에 담기는 리뷰. `score`는 0.65~0.98로 정규화한 표시용 값이다(코사인 유사도가 아님). */
export interface SourceReview {
  id: string;
  title: string;
  content: string;
  rating: number;
  author: string;
  date: string;
  score: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** 어시스턴트 답변의 근거 리뷰. 실데이터 모드에서 `messages.sources`에 함께 저장한다(Mock은 무시). */
  sources?: SourceReview[];
}

/** 일반 API 응답 포맷 (`/api/chat` 제외). 성공 응답에는 현재 데이터 모드가 함께 실린다. */
export interface ApiResponse<T = unknown> {
  success: boolean;
  mode?: DataMode;
  data?: T;
  error?: string;
}

/** `/api/chat` 응답 포맷 */
export interface ChatResponse {
  success: boolean;
  mode?: DataMode;
  answer?: string;
  sources?: SourceReview[];
  error?: string;
}

/** `POST /api/index-data` 응답 데이터 */
export interface IndexResult {
  /** 적재된 리뷰 건수 */
  indexed: number;
}

/** 채팅 스트림에 표시되는 항목 (UI 전용) */
export interface ChatItem {
  id: number;
  kind: "user" | "assistant" | "error" | "notice";
  content: string;
  sources?: SourceReview[];
}

export type IndexState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; count: number }
  | { phase: "error"; error: string };

/** `GET /api/status` 응답 데이터 */
export interface StatusData {
  mode: DataMode;
  /** 인덱싱 여부 (`/api/index-data`의 `indexed`와 달리 불리언) */
  indexed: boolean;
  count: number;
}
