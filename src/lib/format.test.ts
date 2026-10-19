import { describe, expect, it } from "vitest";
import { formatReviewDate, toMatchPercent } from "@/lib/format";

describe("formatReviewDate", () => {
  it("YYYY-MM-DD를 YYYY.MM.DD로 바꾼다", () => {
    expect(formatReviewDate("2024-02-01")).toBe("2024.02.01");
    expect(formatReviewDate("2024-12-31")).toBe("2024.12.31");
  });

  it("시각이 붙어 있어도 날짜 부분만 쓴다", () => {
    expect(formatReviewDate("2024-02-01T09:30:00Z")).toBe("2024.02.01");
  });

  it("앞뒤 공백을 무시한다", () => {
    expect(formatReviewDate("  2024-02-01  ")).toBe("2024.02.01");
  });

  it("다른 형식은 원문 그대로 돌려준다", () => {
    expect(formatReviewDate("2024/02/01")).toBe("2024/02/01");
    expect(formatReviewDate("2024년 2월 1일")).toBe("2024년 2월 1일");
    expect(formatReviewDate("어제")).toBe("어제");
  });

  it("비었거나 없으면 null이다", () => {
    expect(formatReviewDate("")).toBeNull();
    expect(formatReviewDate("   ")).toBeNull();
    expect(formatReviewDate(undefined)).toBeNull();
    expect(formatReviewDate(null)).toBeNull();
  });

  it("실제 날짜인지는 검증하지 않고 형식만 본다(시간대 변환 없음)", () => {
    expect(formatReviewDate("2024-01-01")).toBe("2024.01.01");
  });
});

describe("toMatchPercent", () => {
  it("점수에 100을 곱해 반올림한다", () => {
    expect(toMatchPercent(0.89)).toBe(89);
    expect(toMatchPercent(0.98)).toBe(98);
    expect(toMatchPercent(0.65)).toBe(65);
    expect(toMatchPercent(0.894)).toBe(89);
    expect(toMatchPercent(0.896)).toBe(90);
  });

  it("0.885처럼 부동소수 경계도 올림한다", () => {
    expect(toMatchPercent(0.885)).toBe(89);
    expect(toMatchPercent(0.145)).toBe(15);
    expect(toMatchPercent(0.575)).toBe(58);
  });

  it("0~100으로 제한한다", () => {
    expect(toMatchPercent(1.2)).toBe(100);
    expect(toMatchPercent(1)).toBe(100);
    expect(toMatchPercent(0)).toBe(0);
    expect(toMatchPercent(-0.1)).toBe(0);
  });

  it("숫자가 아니면 null이다", () => {
    expect(toMatchPercent(NaN)).toBeNull();
    expect(toMatchPercent(Infinity)).toBeNull();
    expect(toMatchPercent(undefined)).toBeNull();
    expect(toMatchPercent(null)).toBeNull();
    expect(toMatchPercent("0.89")).toBeNull();
  });
});
