/** 실데이터 모드에서 필수 환경변수가 없을 때. 메시지에는 변수 이름만 담고 값은 담지 않는다. */
export class ConfigError extends Error {
  constructor(readonly missing: string[]) {
    super(`실데이터 모드 설정이 없습니다: ${missing.join(", ")}`);
    this.name = "ConfigError";
  }
}

/**
 * Pinecone·Supabase 호출 실패. `message`는 서버 로그용 요약이고(응답에는 쓰지 않는다),
 * 원인은 `cause`에 둔다.
 */
export class RealStoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RealStoreError";
  }
}

/** 로그와 응답에서 가려야 하는 비밀 값을 가진 환경변수 */
const SECRET_ENV_NAMES = [
  "KIMI_API_KEY",
  "PINECONE_API_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

// 너무 짧은 값(예: "1")까지 가리면 로그가 망가지므로 최소 길이를 둔다.
const MIN_SECRET_LENGTH = 6;
const MAX_LOG_LENGTH = 600;

/** 현재 환경에 설정된 비밀 값을 `[변수이름]`으로 바꾼다. */
export function redactSecrets(text: string): string {
  let result = text;
  for (const name of SECRET_ENV_NAMES) {
    const value = process.env[name]?.trim();
    if (value && value.length >= MIN_SECRET_LENGTH) result = result.split(value).join(`[${name}]`);
  }
  return result;
}

function summarize(error: Error): string {
  const status = (error as { status?: unknown }).status;
  const code = (error as { code?: unknown }).code;
  const parts = [`${error.name}${typeof status === "number" ? ` (HTTP ${status})` : ""}`];
  if (typeof code === "string" && code) parts.push(`[${code}]`);
  return `${parts.join(" ")}: ${error.message}`;
}

/**
 * 서버 로그에 남길 오류 설명. 오류 객체 전체(요청 헤더 등)를 찍지 않고 이름·상태·메시지와
 * 한 단계 아래 원인만 남기며, 알려진 비밀 값은 가린다.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return "알 수 없는 오류";
  let text = summarize(error);
  if (error.cause instanceof Error) text += ` ← 원인 ${summarize(error.cause)}`;
  const redacted = redactSecrets(text);
  return redacted.length > MAX_LOG_LENGTH ? `${redacted.slice(0, MAX_LOG_LENGTH)}…` : redacted;
}
