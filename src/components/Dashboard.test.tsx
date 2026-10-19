// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "@/components/Dashboard";
import * as api from "@/lib/api-client";
import type { SourceReview, StatusData } from "@/lib/types";

vi.mock("@/lib/api-client");

const getStatus = vi.mocked(api.getStatus);
const runIndexing = vi.mocked(api.runIndexing);
const sendChat = vi.mocked(api.sendChat);

const sources: SourceReview[] = [1, 2, 3].map((n) => ({
  id: `review-${n}`,
  rating: n + 2,
  author: `작성자${n}`,
  title: `제목${n}`,
  content: `내용${n}`,
  date: `2024-01-0${n}`,
  score: 0.98 - n / 100,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function mockStatus(data: Partial<StatusData> = {}) {
  getStatus.mockResolvedValue({ ok: true, data: { mode: "mock", indexed: false, count: 0, ...data } });
}

const input = () => screen.getByLabelText("질문 입력") as HTMLTextAreaElement;
const sendButton = () => screen.getByRole("button", { name: "질문 전송" });
const indexButton = () => screen.getByRole("button", { name: /샘플 데이터 인덱싱/ });

async function renderIndexed() {
  mockStatus({ indexed: true, count: 25 });
  render(<Dashboard />);
  await screen.findByText(/리뷰 25건/);
}

async function ask(question: string) {
  fireEvent.change(input(), { target: { value: question } });
  fireEvent.click(sendButton());
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  sendChat.mockResolvedValue({ ok: true, data: { answer: "답변", sources: [] } });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("레이아웃과 사이드바", () => {
  it("타이틀, 상품 배너, 빈 상태 안내(예시 질문)를 표시한다", async () => {
    mockStatus();
    render(<Dashboard />);

    expect(screen.getByRole("heading", { level: 1, name: "쇼핑 리뷰 AI 분석기" })).toBeTruthy();
    expect(screen.getByTestId("product-name").textContent).toBe("노이즈캔슬링 무선 이어폰 PRO");
    expect(screen.getByTestId("empty-state")).toBeTruthy();
    expect(screen.getByRole("button", { name: "배터리는 얼마나 가나요?" })).toBeTruthy();
    await screen.findByText("Mock 모드");
  });

  it("상태 확인 중에는 '확인 중', 응답 후에는 서버가 준 모드를 표시한다", async () => {
    const status = deferred<Awaited<ReturnType<typeof api.getStatus>>>();
    getStatus.mockReturnValue(status.promise);
    render(<Dashboard />);
    expect(screen.getByTestId("mode-badge").textContent).toBe("확인 중");

    status.resolve({ ok: true, data: { mode: "mock", indexed: false, count: 0 } });
    expect((await screen.findByTestId("mode-badge")).textContent).toBe("Mock 모드");
  });

  it("mode가 real이면 '실데이터 모드'를 표시한다", async () => {
    mockStatus({ mode: "real" });
    render(<Dashboard />);

    await screen.findByText("실데이터 모드");
  });

  it("상태 조회에 실패하면 '모드 확인 불가'를 표시하되 나머지 기능은 계속 쓸 수 있다", async () => {
    getStatus.mockResolvedValue({ ok: false, error: "실패" });
    render(<Dashboard />);

    await screen.findByText("모드 확인 불가");
    expect((indexButton() as HTMLButtonElement).disabled).toBe(false);
    expect(input().disabled).toBe(false);
  });
});

describe("샘플 데이터 인덱싱", () => {
  it("진행 중에는 비활성화(aria-busy)되고, 성공하면 건수와 완료 상태를 표시한다", async () => {
    mockStatus();
    render(<Dashboard />);
    await screen.findByText("Mock 모드");
    const run = deferred<Awaited<ReturnType<typeof api.runIndexing>>>();
    runIndexing.mockReturnValue(run.promise);

    fireEvent.click(indexButton());
    fireEvent.click(indexButton()); // 중복 클릭

    await screen.findByText("인덱싱 중입니다…");
    expect((indexButton() as HTMLButtonElement).disabled).toBe(true);
    expect(indexButton().getAttribute("aria-busy")).toBe("true");
    expect(runIndexing).toHaveBeenCalledTimes(1);

    run.resolve({ ok: true, data: { indexed: 25 } });
    await screen.findByText("인덱싱 완료 · 리뷰 25건");
    expect((indexButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("실패하면 오류 메시지를 표시하고 버튼이 다시 활성화된다", async () => {
    mockStatus();
    render(<Dashboard />);
    await screen.findByText("Mock 모드");
    runIndexing.mockResolvedValue({ ok: false, error: "리뷰 CSV 파일을 읽을 수 없습니다: review.csv" });

    fireEvent.click(indexButton());

    await screen.findByText("리뷰 CSV 파일을 읽을 수 없습니다: review.csv");
    expect((indexButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("새로고침 후에도 서버가 이미 인덱싱된 상태면 완료 상태를 복원한다", async () => {
    await renderIndexed();

    expect(screen.getByText("인덱싱 완료 · 리뷰 25건")).toBeTruthy();
  });
});

describe("질문 입력과 전송", () => {
  it("Enter로 전송하면 질문이 스트림에 추가되고 입력창이 비워지며 대기 표시가 나타난다", async () => {
    await renderIndexed();
    const answer = deferred<Awaited<ReturnType<typeof api.sendChat>>>();
    sendChat.mockReturnValue(answer.promise);

    const user = userEvent.setup();
    await user.type(input(), "배터리는 얼마나 가요?{Enter}");

    expect(sendChat).toHaveBeenCalledWith("배터리는 얼마나 가요?", expect.any(String));
    expect(within(screen.getByTestId("message-user")).getByText("배터리는 얼마나 가요?")).toBeTruthy();
    expect(input().value).toBe("");
    expect(screen.getByTestId("pending")).toBeTruthy();

    answer.resolve({ ok: true, data: { answer: "약 8시간입니다", sources: [] } });
    await screen.findByText("약 8시간입니다");
    expect(screen.queryByTestId("pending")).toBeNull();
  });

  it("한 화면의 모든 질문은 같은 chatId로 보내고, 새로 연 화면은 다른 chatId를 쓴다", async () => {
    await renderIndexed();

    await ask("첫 질문");
    await waitFor(() => expect(sendChat).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId("pending")).toBeNull());
    await ask("둘째 질문");
    await waitFor(() => expect(sendChat).toHaveBeenCalledTimes(2));

    const [first, second] = sendChat.mock.calls.map(([, chatId]) => chatId);
    expect(first).toBeTruthy();
    expect(second).toBe(first);

    cleanup();
    await renderIndexed();
    await ask("새 화면의 질문");
    await waitFor(() => expect(sendChat).toHaveBeenCalledTimes(3));
    expect(sendChat.mock.calls[2][1]).not.toBe(first);
  });

  it("chatId는 렌더 중이 아니라 첫 전송 때 만든다 (전송 전에는 호출되지 않는다)", async () => {
    const uuid = vi.spyOn(crypto, "randomUUID");
    await renderIndexed();

    expect(uuid).not.toHaveBeenCalled();
    await ask("질문");
    await waitFor(() => expect(sendChat).toHaveBeenCalledTimes(1));
    expect(uuid).toHaveBeenCalledTimes(1);

    uuid.mockRestore();
  });

  it("인덱싱 전에 막힌 전송은 chatId도 만들지 않는다", async () => {
    mockStatus();
    render(<Dashboard />);
    await screen.findByText("Mock 모드");
    const uuid = vi.spyOn(crypto, "randomUUID");

    await ask("질문");

    expect(uuid).not.toHaveBeenCalled();
    uuid.mockRestore();
  });

  it("새 메시지가 추가되면 최신 위치로 스크롤한다", async () => {
    await renderIndexed();
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    scroll.mockClear();

    await ask("질문");
    await screen.findByText("답변");

    expect(scroll).toHaveBeenCalled();
  });

  it("빈 입력이나 공백뿐인 입력은 전송하지 않는다", async () => {
    await renderIndexed();

    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input(), { target: { value: "   " } });
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(input(), { key: "Enter" });

    expect(sendChat).not.toHaveBeenCalled();
  });

  it("답변 대기 중에는 추가 전송이 막힌다", async () => {
    await renderIndexed();
    const answer = deferred<Awaited<ReturnType<typeof api.sendChat>>>();
    sendChat.mockReturnValue(answer.promise);
    await ask("첫 질문");

    fireEvent.change(input(), { target: { value: "두 번째 질문" } });
    expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(input(), { key: "Enter" });

    expect(sendChat).toHaveBeenCalledTimes(1);
    answer.resolve({ ok: true, data: { answer: "답변", sources: [] } });
    await screen.findByText("답변");
  });

  it("인덱싱 전에 전송하면 안내를 보여주고 요청하지 않으며 입력은 유지한다", async () => {
    mockStatus();
    render(<Dashboard />);
    await screen.findByText("Mock 모드");

    await ask("배터리");

    expect(within(await screen.findByTestId("message-notice")).getByText(/인덱싱/)).toBeTruthy();
    expect(sendChat).not.toHaveBeenCalled();
    expect(input().value).toBe("배터리");
  });

  it("응답이 실패하면 오류 메시지를 보여주고 다시 질문할 수 있다", async () => {
    await renderIndexed();
    sendChat.mockResolvedValueOnce({ ok: false, error: "답변을 생성하는 중 오류가 발생했습니다." });

    await ask("배터리");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("답변을 생성하는 중 오류가 발생했습니다.");
    await ask("다시 질문");
    await screen.findByText("답변");
    expect(sendChat).toHaveBeenCalledTimes(2);
  });

  it("전송 버튼은 접근 가능한 이름을 가진다", async () => {
    await renderIndexed();

    expect(sendButton().getAttribute("aria-label")).toBe("질문 전송");
  });
});

describe("한글 IME 중복 전송 방지", () => {
  it("조합 중 Enter는 전송하지 않고, 조합 완료 후 Enter는 정확히 한 번만 전송한다", async () => {
    await renderIndexed();
    fireEvent.change(input(), { target: { value: "배터리" } });

    fireEvent.keyDown(input(), { key: "Enter", isComposing: true });
    expect(sendChat).not.toHaveBeenCalled();
    expect(input().value).toBe("배터리");

    fireEvent.keyDown(input(), { key: "Enter", isComposing: false });
    fireEvent.keyDown(input(), { key: "Enter", isComposing: false }); // 입력창이 비어 재전송되지 않아야 한다
    await screen.findByText("답변");
    expect(sendChat).toHaveBeenCalledTimes(1);
  });

  it("조합 중 Enter는 기본 동작을 막지 않는다(조합 확정에 필요)", async () => {
    await renderIndexed();
    fireEvent.change(input(), { target: { value: "배터리" } });

    const notPrevented = fireEvent.keyDown(input(), { key: "Enter", isComposing: true });

    expect(notPrevented).toBe(true);
  });

  it("Shift+Enter는 전송하지 않고 줄바꿈 기본 동작을 유지한다", async () => {
    await renderIndexed();
    fireEvent.change(input(), { target: { value: "첫 줄" } });

    const notPrevented = fireEvent.keyDown(input(), { key: "Enter", shiftKey: true });

    expect(notPrevented).toBe(true);
    expect(sendChat).not.toHaveBeenCalled();
  });
});

describe("참고 리뷰 아코디언", () => {
  it("근거가 있으면 '참고 리뷰 N건' 배지를 보여주고 기본은 접혀 있다", async () => {
    await renderIndexed();
    sendChat.mockResolvedValue({ ok: true, data: { answer: "답변", sources } });

    await ask("배터리");

    const toggle = await screen.findByRole("button", { name: /참고 리뷰 3건/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(panel.hidden).toBe(true);
  });

  it("펼치면 sources 건수만큼 평점·작성자·제목·내용 카드가 보인다", async () => {
    await renderIndexed();
    sendChat.mockResolvedValue({ ok: true, data: { answer: "답변", sources } });
    await ask("배터리");

    const toggle = await screen.findByRole("button", { name: /참고 리뷰 3건/ });
    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(panel.hidden).toBe(false);
    const cards = within(panel).getAllByRole("article");
    expect(cards).toHaveLength(3);
    expect(within(cards[0]).getByRole("img", { name: "평점 3점" })).toBeTruthy();
    expect(within(cards[0]).getByText("작성자1")).toBeTruthy();
    expect(within(cards[0]).getByText("제목1")).toBeTruthy();
    expect(within(cards[0]).getByText("내용1")).toBeTruthy();

    fireEvent.click(toggle);
    expect(panel.hidden).toBe(true);
  });

  it("키보드(Enter/Space)로도 펼칠 수 있는 버튼이다", async () => {
    await renderIndexed();
    sendChat.mockResolvedValue({ ok: true, data: { answer: "답변", sources } });
    await ask("배터리");
    const toggle = await screen.findByRole("button", { name: /참고 리뷰 3건/ });

    const user = userEvent.setup();
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await user.keyboard(" ");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("근거가 없으면 배지와 아코디언을 표시하지 않는다", async () => {
    await renderIndexed();

    await ask("배송");
    await screen.findByText("답변");

    expect(screen.queryByTestId("source-badge")).toBeNull();
  });
});

describe("질문 히스토리", () => {
  const historyItems = () =>
    within(screen.getByRole("region", { name: "최근 분석 질문" })).queryAllByRole("button");

  it("질문이 없으면 빈 상태 안내를 보여준다", async () => {
    mockStatus();
    render(<Dashboard />);

    expect(within(screen.getByRole("region", { name: "최근 분석 질문" })).getByText("아직 질문이 없어요")).toBeTruthy();
    await screen.findByText("Mock 모드");
  });

  it("최신순으로 쌓이고 같은 질문은 맨 위로 옮겨 한 번만 보인다", async () => {
    await renderIndexed();

    for (const q of ["첫째", "둘째", "첫째"]) {
      await ask(q);
      await waitFor(() => expect((sendButton() as HTMLButtonElement).disabled).toBe(true));
      await waitFor(() => expect(screen.queryByTestId("pending")).toBeNull());
    }

    expect(historyItems().map((b) => b.textContent)).toEqual(["첫째", "둘째"]);
  });

  it("10개를 넘으면 가장 오래된 항목이 사라진다", async () => {
    await renderIndexed();

    for (let i = 1; i <= 11; i++) {
      await ask(`질문${i}`);
      await waitFor(() => expect(sendChat).toHaveBeenCalledTimes(i));
      await waitFor(() => expect(screen.queryByTestId("pending")).toBeNull());
    }

    const texts = historyItems().map((b) => b.textContent);
    expect(texts).toHaveLength(10);
    expect(texts[0]).toBe("질문11");
    expect(texts).not.toContain("질문1");
  });

  it("항목을 누르면 입력창에 채우고 포커스하되 전송하지 않는다", async () => {
    await renderIndexed();
    await ask("배터리는?");
    await screen.findByText("답변");
    sendChat.mockClear();

    fireEvent.click(historyItems()[0]);

    expect(input().value).toBe("배터리는?");
    expect(document.activeElement).toBe(input());
    expect(sendChat).not.toHaveBeenCalled();
  });

  it("예시 질문도 입력창에 채우기만 한다", async () => {
    mockStatus();
    render(<Dashboard />);

    fireEvent.click(screen.getByRole("button", { name: "착용감은 어때요?" }));

    expect(input().value).toBe("착용감은 어때요?");
    expect(sendChat).not.toHaveBeenCalled();
    await screen.findByText("Mock 모드");
  });
});
