import { readFile } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import type { Review } from "@/lib/types";

const REQUIRED_COLUMNS = ["rating", "title", "content"] as const;

export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvError";
  }
}

/** CSV 텍스트를 Review 배열로 변환한다. 제목과 내용이 모두 빈 행은 건너뛴다. */
export function parseReviews(text: string): Review[] {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const fields = parsed.meta.fields ?? [];
  const missing = REQUIRED_COLUMNS.filter((c) => !fields.includes(c));
  if (missing.length > 0) {
    throw new CsvError(`CSV에 필수 컬럼이 없습니다: ${missing.join(", ")}`);
  }

  const reviews: Review[] = [];
  const usedIds = new Set<string>();
  for (const row of parsed.data) {
    const title = (row.title ?? "").trim();
    const content = (row.content ?? "").trim();
    if (!title && !content) continue;

    // CSV의 id를 우선 쓰되, 비었거나 중복이면 적재 순서 기반 id로 대체해 항상 고유하게 유지한다.
    let id = (row.id ?? "").trim();
    if (!id || usedIds.has(id)) id = `review-${reviews.length + 1}`;
    while (usedIds.has(id)) id += "-dup";
    usedIds.add(id);

    const rating = Number.parseFloat(row.rating ?? "");
    const votes = Number.parseInt(row.helpful_votes ?? "", 10);
    reviews.push({
      id,
      rating: Number.isFinite(rating) ? rating : 0,
      author: (row.author ?? "").trim(),
      title,
      content,
      date: (row.date ?? "").trim(),
      helpfulVotes: Number.isFinite(votes) && votes > 0 ? votes : 0,
      verifiedPurchase: /^true$/i.test((row.verified_purchase ?? "").trim()),
    });
  }
  return reviews;
}

/** `samples/review.csv`를 읽어 파싱한다. */
export async function loadReviews(): Promise<Review[]> {
  let text: string;
  try {
    // 경로를 호출 안에 정적으로 적어야 번들러가 이 파일만 추적한다(변수 경로는 프로젝트 전체를 추적).
    text = await readFile(path.join(process.cwd(), "samples", "review.csv"), "utf8");
  } catch {
    throw new CsvError("리뷰 CSV 파일을 읽을 수 없습니다: review.csv");
  }
  return parseReviews(text);
}
