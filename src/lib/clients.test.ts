import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 실제 SDK를 만들면 네트워크로 나갈 수 있으므로 둘 다 가짜로 바꾼다.
const mocks = vi.hoisted(() => ({
  pineconeCtor: vi.fn(),
  indexFn: vi.fn(),
  namespaceFn: vi.fn(),
  createClientFn: vi.fn(),
}));

vi.mock("@pinecone-database/pinecone", () => ({
  Pinecone: class {
    constructor(options: unknown) {
      mocks.pineconeCtor(options);
    }
    index(...args: unknown[]) {
      mocks.indexFn(...args);
      return { namespace: mocks.namespaceFn };
    }
  },
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClientFn }));

import { REVIEW_NAMESPACE, getReviewNamespace, getSupabase, readRealConfig, resetClients } from "@/lib/clients";
import { ConfigError } from "@/lib/errors";

const FULL_ENV = {
  PINECONE_API_KEY: "pcsk_test_key_123456",
  PINECONE_INDEX_NAME: "review-chatbot",
  PINECONE_HOST: "review-chatbot-abc.svc.example.pinecone.io",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_123456",
};

const ALL_NAMES = [
  ...Object.keys(FULL_ENV),
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function setEnv(env: Record<string, string | undefined>) {
  for (const name of ALL_NAMES) vi.stubEnv(name, env[name]);
}

function configErrorFor(env: Record<string, string | undefined>): ConfigError {
  setEnv(env);
  try {
    readRealConfig();
  } catch (error) {
    return error as ConfigError;
  }
  throw new Error("ConfigError가 던져져야 한다");
}

beforeEach(() => {
  resetClients();
  mocks.namespaceFn.mockImplementation((name: string) => ({ name }));
  mocks.createClientFn.mockImplementation((url: string, key: string) => ({ url, key }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("readRealConfig: 필수 설정 검증", () => {
  it("전부 있으면 설정을 돌려준다", () => {
    setEnv(FULL_ENV);

    expect(readRealConfig()).toEqual({
      pineconeApiKey: FULL_ENV.PINECONE_API_KEY,
      pineconeIndexName: "review-chatbot",
      pineconeHost: FULL_ENV.PINECONE_HOST,
      supabaseUrl: FULL_ENV.NEXT_PUBLIC_SUPABASE_URL,
      supabaseKey: FULL_ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
  });

  it("아무것도 없으면 빠진 변수 4개의 이름을 모두 알려준다", () => {
    const error = configErrorFor({});

    expect(error).toBeInstanceOf(ConfigError);
    expect(error.missing).toEqual([
      "PINECONE_API_KEY",
      "PINECONE_INDEX_NAME",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]);
  });

  it.each([
    ["PINECONE_API_KEY"],
    ["PINECONE_INDEX_NAME"],
    ["NEXT_PUBLIC_SUPABASE_URL"],
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
  ])("%s 하나만 빠져도 그 이름만 알려준다", (name) => {
    const error = configErrorFor({ ...FULL_ENV, [name]: undefined });

    expect(error.missing).toEqual([name]);
  });

  it("공백뿐인 값은 없는 것으로 본다", () => {
    const error = configErrorFor({ ...FULL_ENV, PINECONE_API_KEY: "   ", NEXT_PUBLIC_SUPABASE_URL: "" });

    expect(error.missing).toEqual(["PINECONE_API_KEY", "NEXT_PUBLIC_SUPABASE_URL"]);
  });

  it("오류 메시지에는 변수 이름만 있고 설정된 값은 없다", () => {
    const error = configErrorFor({ ...FULL_ENV, PINECONE_INDEX_NAME: undefined });

    expect(error.message).toContain("PINECONE_INDEX_NAME");
    for (const value of Object.values(FULL_ENV)) expect(error.message).not.toContain(value as string);
  });

  it("설정이 없으면 외부 SDK를 만들지 않는다 (외부 요청 없음)", () => {
    setEnv({});

    expect(() => getReviewNamespace()).toThrow(ConfigError);
    expect(() => getSupabase()).toThrow(ConfigError);
    expect(mocks.pineconeCtor).not.toHaveBeenCalled();
    expect(mocks.createClientFn).not.toHaveBeenCalled();
  });
});

describe("Supabase 공개 키 우선순위", () => {
  const KEYS = {
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: "default-key-111111",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key-222222",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-333333",
  };
  const withoutKey = { ...FULL_ENV, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined };

  it("셋 다 있으면 PUBLISHABLE_DEFAULT_KEY를 쓴다", () => {
    setEnv({ ...withoutKey, ...KEYS });

    expect(readRealConfig().supabaseKey).toBe("default-key-111111");
  });

  it("DEFAULT가 비어 있으면 PUBLISHABLE_KEY를 쓴다", () => {
    setEnv({ ...withoutKey, ...KEYS, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: "  " });

    expect(readRealConfig().supabaseKey).toBe("publishable-key-222222");
  });

  it("그것도 없으면 ANON_KEY를 쓴다", () => {
    setEnv({ ...withoutKey, NEXT_PUBLIC_SUPABASE_ANON_KEY: KEYS.NEXT_PUBLIC_SUPABASE_ANON_KEY });

    expect(readRealConfig().supabaseKey).toBe("anon-key-333333");
  });

  it("셋 다 없으면 키 이름을 안내하는 ConfigError", () => {
    expect(configErrorFor(withoutKey).missing).toEqual(["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);
  });

  it("SUPABASE_SERVICE_ROLE_KEY가 있으면 공개 키보다 먼저 쓴다", () => {
    setEnv({ ...FULL_ENV, ...KEYS, SUPABASE_SERVICE_ROLE_KEY: "service-key-444444" });

    expect(readRealConfig().supabaseKey).toBe("service-key-444444");
  });

  it("서버 전용 키만 있어도 공개 키 없이 설정이 완성된다", () => {
    setEnv({ ...withoutKey, SUPABASE_SERVICE_ROLE_KEY: "service-key-444444" });

    expect(readRealConfig().supabaseKey).toBe("service-key-444444");
  });

  it("서버 전용 키가 공백이면 공개 키로 돌아간다", () => {
    setEnv({ ...FULL_ENV, SUPABASE_SERVICE_ROLE_KEY: "   " });

    expect(readRealConfig().supabaseKey).toBe(FULL_ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  });

  it("앞뒤 공백은 잘라서 쓴다", () => {
    setEnv({ ...FULL_ENV, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "  sb_key_with_spaces  " });

    expect(readRealConfig().supabaseKey).toBe("sb_key_with_spaces");
  });
});

describe("Pinecone 호스트", () => {
  it("호스트가 있으면 pc.index(name, host)로 만든다", () => {
    setEnv(FULL_ENV);

    getReviewNamespace();

    expect(mocks.indexFn).toHaveBeenCalledWith("review-chatbot", FULL_ENV.PINECONE_HOST);
  });

  it.each([[""], ["   "], ["https://review-chatbot-xxxx.svc.aped-4627-b74a.pinecone.io"], ["HTTPS://REVIEW-XXXX.example"]])(
    "호스트가 %j(비었거나 예시 값 xxxx)이면 ConfigError 없이 이름만으로 만든다",
    (host) => {
      setEnv({ ...FULL_ENV, PINECONE_HOST: host });

      expect(() => getReviewNamespace()).not.toThrow();

      expect(mocks.indexFn).toHaveBeenCalledWith("review-chatbot");
      expect(readRealConfig().pineconeHost).toBeUndefined();
    },
  );

  it("호스트가 아예 없어도 이름만으로 만든다", () => {
    setEnv({ ...FULL_ENV, PINECONE_HOST: undefined });

    getReviewNamespace();

    expect(mocks.indexFn).toHaveBeenCalledWith("review-chatbot");
  });

  it("API 키로 클라이언트를 만들고 네임스페이스는 reviews다", () => {
    setEnv(FULL_ENV);

    const ns = getReviewNamespace();

    expect(mocks.pineconeCtor).toHaveBeenCalledWith({ apiKey: FULL_ENV.PINECONE_API_KEY });
    expect(REVIEW_NAMESPACE).toBe("reviews");
    expect(mocks.namespaceFn).toHaveBeenCalledWith("reviews");
    expect(ns).toEqual({ name: "reviews" });
  });
});

describe("Supabase 클라이언트", () => {
  it("URL과 공개 키로 만들고 세션을 저장하지 않는다", () => {
    setEnv(FULL_ENV);

    getSupabase();

    expect(mocks.createClientFn).toHaveBeenCalledWith(
      FULL_ENV.NEXT_PUBLIC_SUPABASE_URL,
      FULL_ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  });
});

describe("클라이언트 재사용", () => {
  it("같은 설정이면 한 번만 만든다", () => {
    setEnv(FULL_ENV);

    expect(getReviewNamespace()).toBe(getReviewNamespace());
    expect(getSupabase()).toBe(getSupabase());

    expect(mocks.pineconeCtor).toHaveBeenCalledTimes(1);
    expect(mocks.createClientFn).toHaveBeenCalledTimes(1);
  });

  it("설정이 바뀌면 새로 만든다", () => {
    setEnv(FULL_ENV);
    getReviewNamespace();
    getSupabase();

    setEnv({ ...FULL_ENV, PINECONE_API_KEY: "pcsk_other_key_654321", NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" });
    getReviewNamespace();
    getSupabase();

    expect(mocks.pineconeCtor).toHaveBeenCalledTimes(2);
    expect(mocks.createClientFn).toHaveBeenCalledTimes(2);
  });

  it("resetClients 후에는 다시 만든다", () => {
    setEnv(FULL_ENV);
    getReviewNamespace();

    resetClients();
    getReviewNamespace();

    expect(mocks.pineconeCtor).toHaveBeenCalledTimes(2);
  });
});
