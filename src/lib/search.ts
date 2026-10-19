import type { Review, SourceReview } from "@/lib/types";

export const DEFAULT_TOP_K = 5;
const TITLE_WEIGHT = 2;
const CONTENT_WEIGHT = 1;

// 표시용 점수 범위. combined(0~1)를 [SCORE_MIN, SCORE_MIN + SCORE_SPAN] = [0.65, 0.98]에 대응시킨다.
// 코사인 유사도가 아니라 정규화 값이며, 실데이터 모드에서는 검색 엔진의 점수로 대체된다.
const SCORE_MIN = 0.65;
const SCORE_SPAN = 0.33;
// 관련도가 지배적이고, 도움이 됨 수는 비슷한 관련도 사이의 순서를 가른다.
const RELEVANCE_RATIO = 0.8;
const VOTES_RATIO = 0.2;

/** 소문자화 후 공백·문장부호 기준으로 나누고, 길이 1 토큰과 중복은 제외한다. */
export function tokenize(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2);
  return [...new Set(tokens)];
}

/** 토큰이 텍스트에 포함되는지 본다. 3글자 이상이면 끝 한 글자를 뗀 형태(조사 변화)도 허용한다. */
function matches(text: string, token: string): boolean {
  if (text.includes(token)) return true;
  return token.length >= 3 && text.includes(token.slice(0, -1));
}

/** 매칭된 (토큰, 필드) 쌍의 가중 합. 제목 2, 내용 1. 같은 필드에서 여러 번 나와도 한 번으로 센다. */
export function relevanceOf(review: Review, tokens: string[]): number {
  const title = review.title.toLowerCase();
  const content = review.content.toLowerCase();
  let relevance = 0;
  for (const token of tokens) {
    if (matches(title, token)) relevance += TITLE_WEIGHT;
    if (matches(content, token)) relevance += CONTENT_WEIGHT;
  }
  return relevance;
}

function toScore(combined: number): number {
  return Math.round((SCORE_MIN + SCORE_SPAN * combined) * 100) / 100;
}

function toSource({ id, title, content, rating, author, date }: Review, combined: number): SourceReview {
  return { id, title, content, rating, author, date, score: toScore(combined) };
}

/**
 * 질문과 관련된 리뷰를 점수 내림차순(동점은 원래 순서) 상위 topK건 반환한다.
 * - 점수 = 0.65 + 0.33 × (0.8 × 관련도/최대관련도 + 0.2 × 도움이 됨/최대도움이 됨)
 * - 매칭되는 키워드가 없거나 키워드를 뽑을 수 없으면 helpfulVotes 상위 topK건을 반환한다.
 */
export function searchReviews(
  reviews: Review[],
  query: string,
  topK: number = DEFAULT_TOP_K,
): SourceReview[] {
  const maxVotes = Math.max(0, ...reviews.map((r) => r.helpfulVotes));
  const votesRatio = (review: Review) => (maxVotes > 0 ? review.helpfulVotes / maxVotes : 0);

  const tokens = tokenize(query);
  const matched = reviews
    .map((review, index) => ({ review, index, relevance: relevanceOf(review, tokens) }))
    .filter((entry) => entry.relevance > 0);

  if (matched.length === 0) {
    return reviews
      .map((review, index) => ({ review, index, combined: votesRatio(review) }))
      .sort((a, b) => b.combined - a.combined || a.index - b.index)
      .slice(0, topK)
      .map(({ review, combined }) => toSource(review, combined));
  }

  const maxRelevance = Math.max(...matched.map((m) => m.relevance));
  return matched
    .map(({ review, index, relevance }) => ({
      review,
      index,
      combined: RELEVANCE_RATIO * (relevance / maxRelevance) + VOTES_RATIO * votesRatio(review),
    }))
    .sort((a, b) => b.combined - a.combined || a.index - b.index)
    .slice(0, topK)
    .map(({ review, combined }) => toSource(review, combined));
}
