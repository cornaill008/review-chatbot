import { afterEach, describe, expect, it, vi } from "vitest";
import { getStatus, runIndexing, sendChat } from "@/lib/api-client";

function mockFetch(impl: () => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

afterEach(() => vi.unstubAllGlobals());

describe("getStatus", () => {
  it("성공 응답의 data를 돌려주고 캐시를 사용하지 않는다", async () => {
    const fetchMock = mockFetch(() => json({ success: true, data: { mode: "mock", indexed: true, count: 25 } }));

    expect(await getStatus()).toEqual({ ok: true, data: { mode: "mock", indexed: true, count: 25 } });
    expect(fetchMock).toHaveBeenCalledWith("/api/status", { cache: "no-store" });
  });

  it("success:false면 서버의 error를 돌려준다 (HTTP 500)", async () => {
    mockFetch(() => json({ success: false, error: "저장소 오류" }, 500));

    expect(await getStatus()).toEqual({ ok: false, error: "저장소 오류" });
  });

  it("success:true인데 data가 없으면 해석 오류", async () => {
    mockFetch(() => json({ success: true }));

    expect(await getStatus()).toEqual({ ok: false, error: "서버 응답을 해석할 수 없습니다." });
  });
});

describe("runIndexing", () => {
  it("POST로 요청하고 data.indexed를 적재 건수로 돌려준다", async () => {
    const fetchMock = mockFetch(() => json({ success: true, mode: "mock", data: { indexed: 100 } }));

    expect(await runIndexing()).toEqual({ ok: true, data: { indexed: 100 } });
    expect(fetchMock).toHaveBeenCalledWith("/api/index-data", { method: "POST" });
  });

  it("이전 형식(data.count)이나 숫자가 아닌 indexed는 해석 오류로 본다", async () => {
    mockFetch(() => json({ success: true, data: { count: 25 } }));
    expect(await runIndexing()).toEqual({ ok: false, error: "서버 응답을 해석할 수 없습니다." });

    mockFetch(() => json({ success: true, data: { indexed: "100" } }));
    expect(await runIndexing()).toEqual({ ok: false, error: "서버 응답을 해석할 수 없습니다." });
  });

  it("success:false(422)면 error 문자열을 돌려준다", async () => {
    mockFetch(() => json({ success: false, error: "리뷰 CSV 파일을 읽을 수 없습니다: review.csv" }, 422));

    expect(await runIndexing()).toEqual({ ok: false, error: "리뷰 CSV 파일을 읽을 수 없습니다: review.csv" });
  });
});

describe("sendChat", () => {
  it("query와 chatId를 JSON으로 보내고 answer와 sources를 돌려준다", async () => {
    const sources = [{ id: "r001", rating: 5, author: "a", title: "t", content: "c", date: "2024-01-15", score: 0.9 }];
    const fetchMock = mockFetch(() => json({ success: true, mode: "mock", answer: "답변", sources }));

    expect(await sendChat("배터리는?", "chat-1")).toEqual({ ok: true, data: { answer: "답변", sources } });
    expect(fetchMock).toHaveBeenCalledWith("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "배터리는?", chatId: "chat-1" }),
    });
  });

  it("chatId를 생략하면 본문에도 chatId가 없고, 이전 형식의 message는 보내지 않는다", async () => {
    const fetchMock = mockFetch(() => json({ success: true, answer: "답변" }));

    await sendChat("질문");

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(init.body as string);
    expect(sent).toEqual({ query: "질문" });
    expect(sent).not.toHaveProperty("message");
  });

  it("sources가 없으면 빈 배열로 처리한다", async () => {
    mockFetch(() => json({ success: true, answer: "답변" }));

    expect(await sendChat("q")).toEqual({ ok: true, data: { answer: "답변", sources: [] } });
  });

  it("success:false면 error를 돌려준다 (409)", async () => {
    mockFetch(() => json({ success: false, error: "먼저 [샘플 데이터 인덱싱]을 실행해 주세요." }, 409));

    expect(await sendChat("q")).toEqual({ ok: false, error: "먼저 [샘플 데이터 인덱싱]을 실행해 주세요." });
  });
});

describe("네트워크·파싱 오류", () => {
  it("fetch가 예외를 던지면 네트워크 오류 메시지를 돌려준다", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    for (const result of [await getStatus(), await runIndexing(), await sendChat("q")]) {
      expect(result).toEqual({ ok: false, error: "서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요." });
    }
  });

  it("JSON이 아닌 응답은 해석 오류로 바꾼다", async () => {
    mockFetch(() => Promise.resolve(new Response("<html>502</html>", { status: 502 })));

    expect(await sendChat("q")).toEqual({ ok: false, error: "서버 응답을 해석할 수 없습니다." });
  });

  it("error 문자열이 없는 실패는 일반 오류 메시지를 쓴다", async () => {
    mockFetch(() => json({ success: false }, 500));

    expect(await runIndexing()).toEqual({ ok: false, error: "알 수 없는 오류가 발생했습니다." });
  });
});
