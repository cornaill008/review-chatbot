import { describe, expect, it } from "vitest";
import { DEFAULT_CHAT_ID, normalizeChatId } from "@/lib/chat-id";
import * as reviewStore from "@/lib/review-store";

describe("normalizeChatId", () => {
  it("기본 대화 id는 default다", () => {
    expect(DEFAULT_CHAT_ID).toBe("default");
  });

  it("앞뒤 공백을 자른다", () => {
    expect(normalizeChatId("  abc  ")).toBe("abc");
  });

  it("없거나 비었거나 공백뿐이면 기본 대화 id를 쓴다", () => {
    expect(normalizeChatId(undefined)).toBe("default");
    expect(normalizeChatId(null)).toBe("default");
    expect(normalizeChatId("")).toBe("default");
    expect(normalizeChatId("   ")).toBe("default");
  });

  it("Mock 저장소도 같은 기본 대화 id를 쓴다 (이동 후에도 재노출 유지)", () => {
    expect(reviewStore.DEFAULT_CHAT_ID).toBe(DEFAULT_CHAT_ID);
  });
});
