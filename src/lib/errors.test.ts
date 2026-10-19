import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigError, RealStoreError, describeError, redactSecrets } from "@/lib/errors";

const SECRETS = {
  KIMI_API_KEY: "sk-kimi-secret-1234567890",
  PINECONE_API_KEY: "pcsk_pinecone_secret_abcdefghij",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: "sb_publishable_default_AAAAAAAAAA",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_plain_BBBBBBBBBB",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiJ9.anon.CCCCCCCC",
};

function stubAllSecrets() {
  for (const [name, value] of Object.entries(SECRETS)) vi.stubEnv(name, value);
}

afterEach(() => vi.unstubAllEnvs());

describe("ConfigError", () => {
  it("빠진 변수의 이름만 메시지에 담는다", () => {
    const error = new ConfigError(["PINECONE_API_KEY", "NEXT_PUBLIC_SUPABASE_URL"]);

    expect(error.name).toBe("ConfigError");
    expect(error.missing).toEqual(["PINECONE_API_KEY", "NEXT_PUBLIC_SUPABASE_URL"]);
    expect(error.message).toBe("실데이터 모드 설정이 없습니다: PINECONE_API_KEY, NEXT_PUBLIC_SUPABASE_URL");
  });
});

describe("redactSecrets", () => {
  it("알려진 비밀 값 5종을 모두 [변수이름]으로 가린다", () => {
    stubAllSecrets();
    const text = Object.values(SECRETS).join(" | ");

    const redacted = redactSecrets(text);

    for (const value of Object.values(SECRETS)) expect(redacted).not.toContain(value);
    for (const name of Object.keys(SECRETS)) expect(redacted).toContain(`[${name}]`);
  });

  it("같은 값이 여러 번 나와도 모두 가린다", () => {
    vi.stubEnv("KIMI_API_KEY", SECRETS.KIMI_API_KEY);

    const redacted = redactSecrets(`a ${SECRETS.KIMI_API_KEY} b ${SECRETS.KIMI_API_KEY}`);

    expect(redacted).toBe("a [KIMI_API_KEY] b [KIMI_API_KEY]");
  });

  it("너무 짧은 값(6자 미만)은 로그가 망가지지 않도록 가리지 않는다", () => {
    vi.stubEnv("KIMI_API_KEY", "abc");

    expect(redactSecrets("abc 는 짧다")).toBe("abc 는 짧다");
  });

  it("값이 비어 있거나 공백뿐이면 아무것도 바꾸지 않는다", () => {
    vi.stubEnv("KIMI_API_KEY", "   ");
    vi.stubEnv("PINECONE_API_KEY", "");

    expect(redactSecrets("그대로  입니다")).toBe("그대로  입니다");
  });

  it("앞뒤 공백이 있는 설정 값도 찾아서 가린다", () => {
    vi.stubEnv("KIMI_API_KEY", `  ${SECRETS.KIMI_API_KEY}  `);

    expect(redactSecrets(`key=${SECRETS.KIMI_API_KEY}`)).toBe("key=[KIMI_API_KEY]");
  });
});

describe("describeError", () => {
  it("이름·HTTP 상태·메시지를 남긴다", () => {
    const error = Object.assign(new Error("401 Invalid Authentication"), { status: 401 });

    expect(describeError(error)).toBe("Error (HTTP 401): 401 Invalid Authentication");
  });

  it("문자열 코드(예: Supabase의 42501)를 함께 남긴다", () => {
    const error = Object.assign(new Error("new row violates row-level security policy"), { code: "42501" });

    expect(describeError(error)).toContain("[42501]");
    expect(describeError(error)).toContain("row-level security");
  });

  it("한 단계 아래 원인(cause)을 이어서 남긴다", () => {
    const error = new RealStoreError("Pinecone 검색 실패", { cause: new TypeError("fetch failed") });

    const text = describeError(error);

    expect(text).toContain("RealStoreError: Pinecone 검색 실패");
    expect(text).toContain("← 원인 TypeError: fetch failed");
  });

  it("메시지와 원인에 섞인 비밀 값을 모두 가린다", () => {
    stubAllSecrets();
    const error = new RealStoreError(`Supabase 실패: apikey=${SECRETS.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}`, {
      cause: Object.assign(new Error(`Incorrect API key: ${SECRETS.PINECONE_API_KEY}`), { status: 401 }),
    });

    const text = describeError(error);

    for (const value of Object.values(SECRETS)) expect(text).not.toContain(value);
    expect(text).toContain("[NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY]");
    expect(text).toContain("[PINECONE_API_KEY]");
    expect(text).toContain("HTTP 401");
  });

  it("오류 객체 전체(요청 헤더 등)는 찍지 않는다", () => {
    const error = Object.assign(new Error("실패"), {
      headers: { authorization: "Bearer should-not-appear-in-logs" },
      request: { body: "should-not-appear-either" },
    });

    const text = describeError(error);

    expect(text).not.toContain("should-not-appear");
  });

  it("Error가 아닌 값은 내용을 노출하지 않고 일반 문구만 돌려준다", () => {
    expect(describeError("문자열 오류")).toBe("알 수 없는 오류");
    expect(describeError({ secret: SECRETS.KIMI_API_KEY })).toBe("알 수 없는 오류");
    expect(describeError(undefined)).toBe("알 수 없는 오류");
  });

  it("너무 긴 메시지는 잘라서 로그를 폭주시키지 않는다", () => {
    const text = describeError(new Error("x".repeat(5000)));

    expect(text.length).toBeLessThanOrEqual(601);
    expect(text.endsWith("…")).toBe(true);
  });
});
