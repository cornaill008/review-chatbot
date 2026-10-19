import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { CsvError, loadReviews, parseReviews } from "@/lib/csv";

// 기본은 실제 파일을 읽고, 개별 테스트에서만 실패를 주입한다.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

describe("parseReviews", () => {
  it("정상 CSV를 필드 그대로 파싱한다 (쉼표·따옴표 포함)", () => {
    const csv = [
      "rating,author,title,content",
      '5,김민수,좋아요,"S, M, L 세 가지라 좋아요"',
      "3,이서연,보통,그냥 그래요",
    ].join("\n");

    const reviews = parseReviews(csv);

    expect(reviews).toEqual([
      { id: "review-1", rating: 5, author: "김민수", title: "좋아요", content: "S, M, L 세 가지라 좋아요", date: "", helpfulVotes: 0 },
      { id: "review-2", rating: 3, author: "이서연", title: "보통", content: "그냥 그래요", date: "", helpfulVotes: 0 },
    ]);
  });

  it("필수 컬럼이 없으면 CsvError를 던진다", () => {
    expect(() => parseReviews("rating,author,title\n5,a,b")).toThrow(CsvError);
    expect(() => parseReviews("rating,author,title\n5,a,b")).toThrow(/content/);
  });

  it("제목과 내용이 모두 빈 행은 건너뛰고 id를 연속으로 매긴다", () => {
    const csv = ["rating,author,title,content", "5,a,,", "4,b,제목,", "3,c,,내용"].join("\n");

    const reviews = parseReviews(csv);

    expect(reviews.map((r) => r.id)).toEqual(["review-1", "review-2"]);
    expect(reviews.map((r) => r.author)).toEqual(["b", "c"]);
  });

  it("author 컬럼이 없어도 빈 값으로 적재하고, BOM·헤더 대소문자·공백을 허용한다", () => {
    const csv = "﻿ Rating , Title ,Content\n4,제목,내용";

    expect(parseReviews(csv)).toEqual([
      { id: "review-1", rating: 4, author: "", title: "제목", content: "내용", date: "", helpfulVotes: 0 },
    ]);
  });

  it("date는 문자열 그대로, helpful_votes는 정수로 변환한다", () => {
    const csv = ["id,rating,title,content,author,date,helpful_votes,verified_purchase", "r001,5,제목,내용,작성자,2024-01-15,12,true"].join("\n");

    expect(parseReviews(csv)).toEqual([
      { id: "r001", rating: 5, author: "작성자", title: "제목", content: "내용", date: "2024-01-15", helpfulVotes: 12 },
    ]);
  });

  it("helpful_votes가 숫자가 아니거나 비었거나 음수면 0으로 처리하고 적재는 계속한다", () => {
    const csv = ["rating,title,content,helpful_votes", "5,a,a,abc", "4,b,b,", "3,c,c,-7", "2,d,d,3.9"].join("\n");

    const reviews = parseReviews(csv);

    expect(reviews.map((r) => r.helpfulVotes)).toEqual([0, 0, 0, 3]);
  });

  it("helpful_votes·date 컬럼이 없어도 적재한다", () => {
    const [review] = parseReviews("rating,title,content\n5,제목,내용");

    expect(review).toMatchObject({ date: "", helpfulVotes: 0 });
  });

  it("CSV의 id 컬럼 값을 그대로 쓰고 헤더 대소문자·공백을 허용한다", () => {
    const csv = ["ID,rating,title,content", "r007,2,제목1,내용1", " r013 ,5,제목2,내용2"].join("\n");

    expect(parseReviews(csv).map((r) => r.id)).toEqual(["r007", "r013"]);
  });

  it("id가 비어 있으면 적재 순서 기반 id를 부여한다", () => {
    const csv = ["id,rating,title,content", "r001,5,a,a", ",4,b,b", "r003,3,c,c"].join("\n");

    expect(parseReviews(csv).map((r) => r.id)).toEqual(["r001", "review-2", "r003"]);
  });

  it("id가 중복되면 뒤의 행에 고유한 id를 부여해 모든 id가 서로 다르다", () => {
    const csv = ["id,rating,title,content", "r001,5,a,a", "r001,4,b,b", "r001,3,c,c", "review-2,2,d,d"].join("\n");

    const ids = parseReviews(csv).map((r) => r.id);

    expect(ids[0]).toBe("r001");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("id가 'review-N' 형태와 우연히 겹쳐도 고유성을 유지한다", () => {
    const csv = ["id,rating,title,content", ",5,a,a", "review-1,4,b,b"].join("\n");

    const ids = parseReviews(csv).map((r) => r.id);

    expect(ids[0]).toBe("review-1");
    expect(new Set(ids).size).toBe(2);
  });

  it("평점이 숫자가 아니면 0으로 처리한다", () => {
    const [review] = parseReviews("rating,title,content\nabc,제목,내용");
    expect(review.rating).toBe(0);
  });
});

describe("loadReviews", () => {
  it("파일이 없으면 CsvError를 던진다", async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT"));

    await expect(loadReviews()).rejects.toThrow(CsvError);
  });

  it("samples/review.csv를 20건 이상 읽는다", async () => {
    const reviews = await loadReviews();
    expect(reviews.length).toBeGreaterThanOrEqual(20);
    expect(reviews.every((r) => r.title && r.content)).toBe(true);
  });

  it("samples/review.csv 100건을 date·helpfulVotes와 함께 읽는다", async () => {
    const reviews = await loadReviews();

    expect(reviews).toHaveLength(100);
    expect(reviews[0]).toMatchObject({ id: "r001", date: "2024-01-15", helpfulVotes: 12 });
    expect(reviews.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date))).toBe(true);
    expect(reviews.every((r) => Number.isInteger(r.helpfulVotes) && r.helpfulVotes >= 0)).toBe(true);
    expect(reviews.some((r) => r.helpfulVotes > 0)).toBe(true);
  });

  it("samples/review.csv의 원본 id(r001 등)를 그대로 쓰고 모두 고유하다", async () => {
    const reviews = await loadReviews();
    const ids = reviews.map((r) => r.id);

    expect(ids[0]).toBe("r001");
    expect(ids).toContain("r007");
    expect(ids.every((id) => /^r\d+$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
