import { describe, expect, it } from "vitest";
import { loadReviews } from "@/lib/csv";
import { searchReviews, tokenize } from "@/lib/search";
import type { Review } from "@/lib/types";

function review(id: number, title: string, content: string, helpfulVotes = 0): Review {
  return { id: `review-${id}`, rating: 5, author: "작성자", title, content, date: "2024-01-01", helpfulVotes };
}

const inRange = (score: number) => score >= 0.65 && score <= 0.98;

describe("tokenize", () => {
  it("소문자화하고 문장부호로 나누며 길이 1 토큰과 중복을 제거한다", () => {
    expect(tokenize("ANC, 배터리는 어때요? 배터리는 a")).toEqual(["anc", "배터리는", "어때요"]);
  });

  it("공백이나 문장부호뿐이면 빈 배열이다", () => {
    expect(tokenize("   ?!  ")).toEqual([]);
  });

  it("1글자 단어만 있으면 키워드가 없다", () => {
    expect(tokenize("이 는 가 a")).toEqual([]);
  });
});

describe("searchReviews: 순위와 점수 (2.1)", () => {
  it("매칭 리뷰가 5건보다 많으면 점수 높은 상위 5건만 반환한다", () => {
    const reviews = [
      ...Array.from({ length: 6 }, (_, i) => review(i + 1, "제목", "배터리 좋아요")),
      review(7, "배터리", "배터리 배터리"),
    ];

    const result = searchReviews(reviews, "배터리");

    expect(result).toHaveLength(5);
    expect(result[0].id).toBe("review-7");
  });

  it("모든 score는 0.65 이상 0.98 이하이고 소수 둘째 자리까지이며 내림차순이다", () => {
    const reviews = [
      review(1, "배터리", "음질", 3),
      review(2, "제목", "배터리 좋아요", 50),
      review(3, "배터리 음질", "배터리 음질 좋아요", 7),
      review(4, "무관", "무관", 100),
    ];

    const result = searchReviews(reviews, "배터리 음질");

    expect(result.map((r) => r.id)).toEqual(["review-3", "review-1", "review-2"]);
    expect(result.every((r) => inRange(r.score))).toBe(true);
    expect(result.every((r) => Math.round(r.score * 100) / 100 === r.score)).toBe(true);
    const scores = result.map((r) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("결과가 1건이어도 score는 범위 안이다", () => {
    const [only] = searchReviews([review(1, "배터리", "좋아요"), review(2, "음질", "별로")], "배터리");

    expect(only.id).toBe("review-1");
    expect(inRange(only.score)).toBe(true);
  });

  it("관련도가 최대이고 도움이 됨 수도 최대이면 0.98이다", () => {
    const [top] = searchReviews([review(1, "배터리", "배터리", 10), review(2, "제목", "배터리", 2)], "배터리");

    expect(top.score).toBe(0.98);
  });

  it("제목 매칭이 내용 매칭보다 높은 점수를 받는다 (도움이 됨 수가 같을 때)", () => {
    const reviews = [review(1, "제목", "음질 좋아요", 5), review(2, "음질", "제목", 5)];

    const result = searchReviews(reviews, "음질");

    expect(result.map((r) => r.id)).toEqual(["review-2", "review-1"]);
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it("키워드 포함 횟수가 같으면 helpful_votes가 큰 리뷰가 먼저 나온다", () => {
    const reviews = [review(1, "제목", "배터리 좋아요", 3), review(2, "제목", "배터리 좋아요", 30)];

    const result = searchReviews(reviews, "배터리");

    expect(result.map((r) => r.id)).toEqual(["review-2", "review-1"]);
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it("도움이 됨 수만 많은 리뷰가 관련도 높은 리뷰를 앞지르지 못한다", () => {
    const reviews = [review(1, "제목", "배터리", 1000), review(2, "배터리", "배터리 음질", 0)];

    expect(searchReviews(reviews, "배터리 음질")[0].id).toBe("review-2");
  });

  it("점수와 votes가 모두 같으면 원래 순서를 유지한다", () => {
    const reviews = [review(1, "a", "음질 좋음"), review(2, "b", "음질 별로"), review(3, "c", "음질 보통")];

    expect(searchReviews(reviews, "음질").map((r) => r.id)).toEqual(["review-1", "review-2", "review-3"]);
  });

  it("조사가 붙은 질문도 끝 글자를 뗀 형태로 매칭한다", () => {
    const result = searchReviews([review(1, "배터리", "오래 가요"), review(2, "음질", "좋아요")], "배터리는 오래가나요");

    expect(result.map((r) => r.id)).toEqual(["review-1"]);
  });

  it("source 필드는 id, title, content, rating, author, date, score만 담는다", () => {
    const [result] = searchReviews([review(1, "배터리", "좋아요", 9)], "배터리");

    expect(Object.keys(result).sort()).toEqual(["author", "content", "date", "id", "rating", "score", "title"]);
    expect(result).toMatchObject({ id: "review-1", rating: 5, author: "작성자", title: "배터리", content: "좋아요", date: "2024-01-01" });
  });

  it("topK를 지정할 수 있다", () => {
    const reviews = [review(1, "음질", "좋아요"), review(2, "음질", "별로")];

    expect(searchReviews(reviews, "음질", 1)).toHaveLength(1);
  });
});

describe("searchReviews: 매칭 없을 때 인기 리뷰 기본 반환 (2.2)", () => {
  const reviews = [
    review(1, "a", "내용", 3),
    review(2, "b", "내용", 40),
    review(3, "c", "내용", 40),
    review(4, "d", "내용", 10),
    review(5, "e", "내용", 25),
    review(6, "f", "내용", 1),
    review(7, "g", "내용", 33),
  ];

  it("키워드가 어떤 리뷰에도 없으면 helpful_votes 내림차순 상위 5건을 반환한다 (동점은 원래 순서)", () => {
    const result = searchReviews(reviews, "존재하지않는단어");

    expect(result.map((r) => r.id)).toEqual(["review-2", "review-3", "review-7", "review-5", "review-4"]);
    expect(result.every((r) => inRange(r.score))).toBe(true);
    expect(result[0].score).toBe(0.98);
  });

  it("키워드를 뽑을 수 없는 질문('?')도 인기 리뷰를 반환한다", () => {
    expect(searchReviews(reviews, "?").map((r) => r.id)).toEqual(["review-2", "review-3", "review-7", "review-5", "review-4"]);
    expect(searchReviews(reviews, "").map((r) => r.id)).toHaveLength(5);
  });

  it("리뷰가 5건 미만이면 전부를 helpful_votes 내림차순으로 반환한다", () => {
    const few = [review(1, "a", "x", 1), review(2, "b", "y", 9), review(3, "c", "z", 4)];

    expect(searchReviews(few, "없는단어").map((r) => r.id)).toEqual(["review-2", "review-3", "review-1"]);
  });

  it("모든 helpful_votes가 0이면 앞쪽 5건이고 점수는 0.65이다", () => {
    const flat = Array.from({ length: 8 }, (_, i) => review(i + 1, "t", "c"));

    const result = searchReviews(flat, "없는단어");

    expect(result.map((r) => r.id)).toEqual(["review-1", "review-2", "review-3", "review-4", "review-5"]);
    expect(result.every((r) => r.score === 0.65)).toBe(true);
  });

  it("topK를 지정하면 그만큼만 반환한다", () => {
    expect(searchReviews(reviews, "없는단어", 2)).toHaveLength(2);
  });

  it("리뷰가 하나도 없으면 빈 배열이다", () => {
    expect(searchReviews([], "배터리")).toEqual([]);
  });

  it("매칭이 하나라도 있으면 기본 반환이 아니라 매칭 결과만 반환한다", () => {
    const mixed = [review(1, "배터리", "좋아요", 0), review(2, "무관", "무관", 99)];

    expect(searchReviews(mixed, "배터리").map((r) => r.id)).toEqual(["review-1"]);
  });
});

describe("searchReviews: 실제 샘플 CSV", () => {
  it("배터리 질문은 배터리 리뷰를 최대 5건 찾고 점수가 범위 안이다", async () => {
    const reviews = await loadReviews();

    const result = searchReviews(reviews, "배터리는 얼마나 가나요?");

    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.length).toBeLessThanOrEqual(5);
    expect(result[0].title).toContain("배터리");
    expect(result.every((r) => inRange(r.score))).toBe(true);
  });

  it("무관한 질문은 빈 결과가 아니라 helpful_votes 상위 5건을 반환한다", async () => {
    const reviews = await loadReviews();
    const maxVotes = Math.max(...reviews.map((r) => r.helpfulVotes));

    const result = searchReviews(reviews, "zzzqqq");

    expect(result).toHaveLength(5);
    expect(result[0].score).toBe(0.98);
    expect(reviews.find((r) => r.id === result[0].id)?.helpfulVotes).toBe(maxVotes);
  });
});
