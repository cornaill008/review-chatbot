import { Pinecone, type Index } from "@pinecone-database/pinecone";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ConfigError } from "@/lib/errors";

/** 리뷰 레코드를 넣는 Pinecone 네임스페이스 */
export const REVIEW_NAMESPACE = "reviews";

/**
 * 서버 전용 Supabase 키(service_role/secret). 있으면 공개 키보다 먼저 쓴다.
 * RLS를 우회하므로 NEXT_PUBLIC_ 접두사를 붙이거나 클라이언트 코드에서 읽으면 안 된다.
 */
const SUPABASE_SERVICE_KEY_NAME = "SUPABASE_SERVICE_ROLE_KEY";

/** Supabase 공개 키 후보. 서버 전용 키가 없을 때 앞에서부터 비어 있지 않은 첫 값을 쓴다. */
const SUPABASE_KEY_NAMES = [
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export interface RealConfig {
  pineconeApiKey: string;
  pineconeIndexName: string;
  /** 없거나 예시 값이면 undefined. 그러면 SDK가 인덱스 이름으로 호스트를 찾는다. */
  pineconeHost: string | undefined;
  supabaseUrl: string;
  supabaseKey: string;
}

const read = (name: string): string | undefined => process.env[name]?.trim() || undefined;

/**
 * 실데이터 모드의 필수 설정을 읽는다. 하나라도 없으면 외부 요청 없이 빠진 변수의 이름만 담은
 * `ConfigError`를 던진다. `PINECONE_HOST`는 선택이다.
 */
export function readRealConfig(): RealConfig {
  const pineconeApiKey = read("PINECONE_API_KEY");
  const pineconeIndexName = read("PINECONE_INDEX_NAME");
  const supabaseUrl = read("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseKey = read(SUPABASE_SERVICE_KEY_NAME) ?? SUPABASE_KEY_NAMES.map(read).find(Boolean);

  const missing: string[] = [];
  if (!pineconeApiKey) missing.push("PINECONE_API_KEY");
  if (!pineconeIndexName) missing.push("PINECONE_INDEX_NAME");
  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseKey) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!pineconeApiKey || !pineconeIndexName || !supabaseUrl || !supabaseKey) throw new ConfigError(missing);

  // .env 템플릿의 예시 값(xxxx)이 그대로 남아 있으면 호스트를 지정하지 않은 것으로 본다.
  const host = read("PINECONE_HOST");
  const pineconeHost = host && !/xxxx/i.test(host) ? host : undefined;

  return { pineconeApiKey, pineconeIndexName, pineconeHost, supabaseUrl, supabaseKey };
}

interface ClientCache {
  pinecone?: { key: string; namespace: Index };
  supabase?: { key: string; client: SupabaseClient };
}

// 개발 모드(HMR)에서도 연결을 재사용하도록 globalThis에 둔다. 설정이 바뀌면 새로 만든다.
const globalForClients = globalThis as typeof globalThis & { __realClients?: ClientCache };

function cache(): ClientCache {
  return (globalForClients.__realClients ??= {});
}

/** 리뷰 네임스페이스(`reviews`)에 묶인 Pinecone 인덱스 클라이언트 */
export function getReviewNamespace(): Index {
  const config = readRealConfig();
  const key = [config.pineconeApiKey, config.pineconeIndexName, config.pineconeHost ?? ""].join("|");
  const store = cache();
  if (store.pinecone?.key !== key) {
    const pc = new Pinecone({ apiKey: config.pineconeApiKey });
    const index = config.pineconeHost
      ? pc.index(config.pineconeIndexName, config.pineconeHost)
      : pc.index(config.pineconeIndexName);
    store.pinecone = { key, namespace: index.namespace(REVIEW_NAMESPACE) };
  }
  return store.pinecone.namespace;
}

/** 서버 전용 Supabase 클라이언트(세션을 저장하지 않는다). */
export function getSupabase(): SupabaseClient {
  const config = readRealConfig();
  const key = [config.supabaseUrl, config.supabaseKey].join("|");
  const store = cache();
  if (store.supabase?.key !== key) {
    store.supabase = {
      key,
      client: createClient(config.supabaseUrl, config.supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    };
  }
  return store.supabase.client;
}

/** 테스트에서 캐시된 클라이언트를 버린다. */
export function resetClients(): void {
  globalForClients.__realClients = undefined;
}
