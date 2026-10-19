// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SourceCard from "@/components/SourceCard";
import type { SourceReview } from "@/lib/types";

const base: SourceReview = {
  id: "r008",
  title: "배터리 진짜 오래 가요",
  content: "완충하면 하루 종일 써도 됩니다.",
  rating: 4,
  author: "배터리괴물",
  date: "2024-02-01",
  score: 0.89,
};

const renderCard = (overrides: Partial<SourceReview> = {}) =>
  render(<SourceCard review={{ ...base, ...overrides }} index={1} />);

const stars = () => screen.getByRole("img", { name: /평점/ }).querySelectorAll("svg");
const filledStars = () => [...stars()].filter((s) => s.getAttribute("data-filled") === "true");

afterEach(cleanup);

describe("별점 (2.1)", () => {
  it("4점이면 노란 채움 별 4개와 빈 별 1개, 접근 가능한 이름은 '평점 4점'이다", () => {
    renderCard({ rating: 4 });

    expect(screen.getByRole("img", { name: "평점 4점" })).toBeTruthy();
    expect(stars()).toHaveLength(5);
    expect(filledStars()).toHaveLength(4);
    filledStars().forEach((s) => expect(s.getAttribute("class")).toContain("fill-amber-400"));
    expect([...stars()].filter((s) => s.getAttribute("data-filled") === "false")).toHaveLength(1);
  });

  it("평점이 소수면 반올림한다 (3.5 → 4, 2.4 → 2)", () => {
    renderCard({ rating: 3.5 });
    expect(filledStars()).toHaveLength(4);
    cleanup();
    renderCard({ rating: 2.4 });
    expect(filledStars()).toHaveLength(2);
  });

  it("범위를 벗어난 평점은 7 → 5개, -1 → 0개로 제한한다", () => {
    renderCard({ rating: 7 });
    expect(filledStars()).toHaveLength(5);
    cleanup();
    renderCard({ rating: -1 });
    expect(filledStars()).toHaveLength(0);
    expect(stars()).toHaveLength(5);
  });
});

describe("메타 태그 (2.1)", () => {
  it("작성자와 작성일 태그를 보여주고 날짜는 YYYY.MM.DD로 바꾼다", () => {
    renderCard();

    expect(within(screen.getByTestId("meta-author")).getByText("배터리괴물")).toBeTruthy();
    expect(within(screen.getByTestId("meta-date")).getByText("2024.02.01")).toBeTruthy();
  });

  it("태그는 '리뷰 정보' 목록 안에 있고 아이콘은 스크린리더에서 숨긴다", () => {
    renderCard();

    const list = screen.getByRole("list", { name: "리뷰 정보" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    list.querySelectorAll("svg").forEach((svg) => expect(svg.getAttribute("aria-hidden")).toBe("true"));
  });

  it("작성자가 비어 있으면 작성자 태그만 숨긴다", () => {
    renderCard({ author: "" });

    expect(screen.queryByTestId("meta-author")).toBeNull();
    expect(screen.getByTestId("meta-date")).toBeTruthy();
    expect(screen.getByText(base.title)).toBeTruthy();
  });

  it("작성일이 비어 있으면 작성일 태그만 숨긴다", () => {
    renderCard({ date: "" });

    expect(screen.queryByTestId("meta-date")).toBeNull();
    expect(screen.getByTestId("meta-author")).toBeTruthy();
  });

  it("작성자와 작성일이 모두 없으면 태그 목록 자체가 없다", () => {
    renderCard({ author: "  ", date: "" });

    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByText(base.content)).toBeTruthy();
  });

  it("YYYY-MM-DD가 아닌 작성일은 원문 그대로 보여준다", () => {
    renderCard({ date: "2024/02/01" });

    expect(within(screen.getByTestId("meta-date")).getByText("2024/02/01")).toBeTruthy();
  });
});

describe("일치율 배지 (2.2)", () => {
  it("점수 0.89는 '89% 일치'로 보인다", () => {
    renderCard({ score: 0.89 });

    expect(within(screen.getByTestId("match-badge")).getByText("89% 일치")).toBeTruthy();
  });

  it("0.885는 89%, 1.2는 100%로 반올림·제한한다", () => {
    renderCard({ score: 0.885 });
    expect(screen.getByText("89% 일치")).toBeTruthy();
    cleanup();
    renderCard({ score: 1.2 });
    expect(screen.getByText("100% 일치")).toBeTruthy();
  });

  it("점수가 숫자가 아니면 배지를 표시하지 않는다", () => {
    renderCard({ score: Number.NaN });
    expect(screen.queryByTestId("match-badge")).toBeNull();
    cleanup();
    renderCard({ score: undefined as unknown as number });
    expect(screen.queryByTestId("match-badge")).toBeNull();
    expect(screen.getByText(base.title)).toBeTruthy();
  });

  it("툴팁(title)과 스크린리더 전용 문구로 표시용 점수이며 의미 유사도가 아님을 알린다", () => {
    renderCard({ score: 0.89 });

    const badge = screen.getByTestId("match-badge");
    expect(badge.getAttribute("title")).toContain("0.89");
    expect(badge.getAttribute("title")).toContain("표시용 점수");
    expect(badge.getAttribute("title")).toContain("의미 유사도는 아닙니다");
    expect(badge.textContent).toContain("89% 일치");
    expect(badge.textContent).toContain("표시용 점수이며 의미 유사도는 아닙니다");
    expect(badge.querySelector(".sr-only")).not.toBeNull();
  });

  it("아이콘은 스크린리더에서 숨긴다", () => {
    renderCard();

    screen.getByTestId("match-badge").querySelectorAll("svg").forEach((svg) => expect(svg.getAttribute("aria-hidden")).toBe("true"));
  });
});

describe("카드 구성", () => {
  it("번호, 별점 숫자, 제목, 내용을 보여준다", () => {
    renderCard();

    expect(screen.getByText("[1]")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 4, name: base.title })).toBeTruthy();
    expect(screen.getByText(base.content)).toBeTruthy();
    expect(screen.getByRole("img", { name: "평점 4점" }).textContent).toBe("4");
  });
});
