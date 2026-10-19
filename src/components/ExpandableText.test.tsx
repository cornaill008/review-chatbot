// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExpandableText from "@/components/ExpandableText";

const LONG = "배터리가 정말 오래 갑니다. ".repeat(20);
const SHORT = "짧은 리뷰입니다.";

// jsdom에는 레이아웃이 없다. 긴 글(LONG)은 2줄에 들어가지 않는 것처럼 높이를 주입한다.
//   접힌 상태(line-clamp-2): clientHeight 40, scrollHeight는 긴 글이면 120, 짧은 글이면 40
//   펼친 상태: 둘 다 전체 높이
const layout = { wide: false };
function naturalHeight(el: HTMLElement) {
  const long = (el.textContent ?? "").length > 40 && !layout.wide;
  return long ? 120 : 40;
}

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  disconnected = false;
  constructor(private readonly callback: () => void) {
    FakeResizeObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  trigger() {
    this.callback();
  }
}
const triggerResize = () => act(() => FakeResizeObserver.instances.filter((o) => !o.disconnected).forEach((o) => o.trigger()));

beforeEach(() => {
  layout.wide = false;
  FakeResizeObserver.instances = [];
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
    return naturalHeight(this);
  });
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("line-clamp-2") ? Math.min(40, naturalHeight(this)) : naturalHeight(this);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const paragraph = (text: string) => screen.getByText(text.trim());

describe("ExpandableText: 2줄 말줄임", () => {
  it("긴 내용은 line-clamp-2로 접히고 '더보기' 버튼이 보인다", () => {
    render(<ExpandableText text={LONG} />);

    expect(paragraph(LONG).className).toContain("line-clamp-2");
    const button = screen.getByRole("button", { name: /더보기/ });
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("짧은 내용은 말줄임도 토글 버튼도 없다", () => {
    render(<ExpandableText text={SHORT} />);

    expect(screen.queryByRole("button")).toBeNull();
    expect(paragraph(SHORT).className).not.toContain("cursor-pointer");
  });
});

describe("ExpandableText: 펼치기와 접기", () => {
  it("'더보기' 버튼을 누르면 전체가 펼쳐지고 '접기'로 바뀌며 aria-expanded가 true다", () => {
    render(<ExpandableText text={LONG} />);

    fireEvent.click(screen.getByRole("button", { name: /더보기/ }));

    expect(paragraph(LONG).className).not.toContain("line-clamp-2");
    const button = screen.getByRole("button", { name: /접기/ });
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("다시 누르면 2줄로 돌아간다", () => {
    render(<ExpandableText text={LONG} />);

    fireEvent.click(screen.getByRole("button", { name: /더보기/ }));
    fireEvent.click(screen.getByRole("button", { name: /접기/ }));

    expect(paragraph(LONG).className).toContain("line-clamp-2");
    expect(screen.getByRole("button", { name: /더보기/ }).getAttribute("aria-expanded")).toBe("false");
  });

  it("본문을 클릭해도 펼쳐지고 접힌다", () => {
    render(<ExpandableText text={LONG} />);

    fireEvent.click(paragraph(LONG));
    expect(paragraph(LONG).className).not.toContain("line-clamp-2");

    fireEvent.click(paragraph(LONG));
    expect(paragraph(LONG).className).toContain("line-clamp-2");
  });

  it("글자를 선택(드래그)한 상태의 본문 클릭은 토글하지 않는다", () => {
    render(<ExpandableText text={LONG} />);
    vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => "배터리" } as Selection);

    fireEvent.click(paragraph(LONG));

    expect(paragraph(LONG).className).toContain("line-clamp-2");
  });

  it("키보드 Enter와 Space로 버튼을 조작할 수 있다", async () => {
    const user = userEvent.setup();
    render(<ExpandableText text={LONG} />);
    const button = screen.getByRole("button", { name: /더보기/ });

    button.focus();
    await user.keyboard("{Enter}");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    await user.keyboard(" ");
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("버튼은 본문과 aria-controls로 연결된다", () => {
    render(<ExpandableText text={LONG} />);

    const button = screen.getByRole("button", { name: /더보기/ });
    expect(document.getElementById(button.getAttribute("aria-controls")!)).toBe(paragraph(LONG));
  });
});

describe("ExpandableText: 카드별 독립", () => {
  it("한 카드를 펼쳐도 다른 카드는 접힌 채로 있다", () => {
    const { container } = render(
      <>
        <ExpandableText text={LONG} />
        <ExpandableText text={`${LONG}두 번째 카드`} />
      </>,
    );
    const [first, second] = [...container.querySelectorAll("p")];

    fireEvent.click(screen.getAllByRole("button", { name: /더보기/ })[0]);

    expect(first.className).not.toContain("line-clamp-2");
    expect(second.className).toContain("line-clamp-2");
    expect(screen.getAllByRole("button", { name: /더보기/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /접기/ })).toHaveLength(1);
  });
});

describe("ExpandableText: 크기 변화", () => {
  it("너비가 넓어져 2줄 이내가 되면 버튼이 사라지고, 다시 좁아지면 나타난다", () => {
    render(<ExpandableText text={LONG} />);
    expect(screen.queryByRole("button", { name: /더보기/ })).not.toBeNull();

    layout.wide = true;
    triggerResize();
    expect(screen.queryByRole("button")).toBeNull();

    layout.wide = false;
    triggerResize();
    expect(screen.queryByRole("button", { name: /더보기/ })).not.toBeNull();
  });

  it("닫혀 있던 패널이 열려 크기가 생기는 순간 버튼이 나타난다 (처음에는 높이 0)", () => {
    layout.wide = true; // 처음에는 숨겨져 있어 넘침이 없는 것처럼 측정된다
    render(<ExpandableText text={LONG} />);
    expect(screen.queryByRole("button")).toBeNull();

    layout.wide = false; // 패널이 열려 실제 크기를 갖게 됨
    triggerResize();

    expect(screen.queryByRole("button", { name: /더보기/ })).not.toBeNull();
  });

  it("펼친 상태에서는 너비가 넓어져도 '접기' 버튼이 사라지지 않는다", () => {
    render(<ExpandableText text={LONG} />);
    fireEvent.click(screen.getByRole("button", { name: /더보기/ }));

    layout.wide = true;
    triggerResize();

    expect(screen.getByRole("button", { name: /접기/ })).toBeTruthy();
  });

  it("ResizeObserver가 없는 환경에서도 오류 없이 처음 한 번 측정한다", () => {
    vi.stubGlobal("ResizeObserver", undefined);

    render(<ExpandableText text={LONG} />);

    expect(screen.getByRole("button", { name: /더보기/ })).toBeTruthy();
  });

  it("언마운트하면 observer를 해제한다", () => {
    const { unmount } = render(<ExpandableText text={LONG} />);
    const observer = FakeResizeObserver.instances.at(-1)!;

    unmount();

    expect(observer.disconnected).toBe(true);
  });

  it("내용이 바뀌면 다시 측정한다", () => {
    const { rerender } = render(<ExpandableText text={LONG} />);
    expect(screen.queryByRole("button")).not.toBeNull();

    rerender(<ExpandableText text={SHORT} />);

    expect(screen.queryByRole("button")).toBeNull();
  });
});
