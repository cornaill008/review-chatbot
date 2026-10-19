import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";
import type { BasePromptValueInterface } from "@langchain/core/prompt_values";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import type { Runnable } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import type { ChatMessage, SourceReview } from "@/lib/types";

// Kimi(Moonshot AI)는 OpenAI 호환 API다. 이 키는 국제 엔드포인트(.ai)에서만 인증되는 것을 확인했다.
export const DEFAULT_MODEL = "kimi-k2.6";
export const DEFAULT_BASE_URL = "https://api.moonshot.ai/v1";
export const MAX_TOKENS = 2048;
export const REQUEST_TIMEOUT_MS = 60_000;
export const HISTORY_LIMIT = 6;
export const NO_RESULT_ANSWER =
  "질문과 관련된 리뷰를 찾지 못했습니다. 상품의 배터리, 음질, 착용감처럼 다른 표현으로 질문해 주세요.";

export class MissingApiKeyError extends Error {
  constructor() {
    super("KIMI_API_KEY가 설정되지 않았습니다. .env.local에 API 키를 설정해 주세요.");
    this.name = "MissingApiKeyError";
  }
}

export type ChatModel = Runnable<BasePromptValueInterface, BaseMessage>;

/** 공백뿐인 값도 "키 없음"으로 본다. 이전의 ANTHROPIC_API_KEY는 읽지 않는다. */
export function hasApiKey(): boolean {
  return Boolean(process.env.KIMI_API_KEY?.trim());
}

/** 환경변수가 없거나 공백뿐이면 기본값을 쓴다. */
function envOrDefault(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export function createModel(): ChatModel {
  if (!hasApiKey()) throw new MissingApiKeyError();
  return new ChatOpenAI({
    model: envOrDefault("KIMI_MODEL", DEFAULT_MODEL),
    apiKey: process.env.KIMI_API_KEY!.trim(),
    configuration: { baseURL: envOrDefault("KIMI_BASE_URL", DEFAULT_BASE_URL).replace(/\/+$/, "") },
    // kimi-k2.6은 temperature로 1만 허용한다(다른 값은 400). 그래서 지정하지 않는다.
    maxTokens: MAX_TOKENS,
    // 응답이 없을 때 대화가 오래 멈춰 있지 않도록 제한 시간과 재시도 횟수를 짧게 둔다.
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 1,
    // 추론을 끄면 같은 질문이 4~6초에서 0.8초로, completion 토큰이 140~250에서 17로 준다.
    // 리뷰 인용·요약에는 깊은 추론이 필수가 아니다. 추론 내용은 어차피 answer에 담기지 않는다.
    modelKwargs: { thinking: { type: "disabled" } },
  });
}

const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    [
      "당신은 전자제품 쇼핑몰의 전문 리뷰 분석가입니다.",
      "아래 제공된 [실제 구매 고객 리뷰 데이터]만을 바탕으로 사용자의 질문에 친절하고 솔직하게 답변하세요.",
      "리뷰에 없는 사실을 추측하여 지어내지 마세요. 리뷰에서 확인되지 않는 내용은 '리뷰에서 확인되지 않습니다'라고 말하세요.",
      "장점과 단점이 모두 존재한다면 균형 있게 설명하고, 관련 리뷰 작성자의 의견을 인용하세요.",
      "답변은 한국어로 작성하세요.",
      "채팅 화면은 마크다운을 표시하지 못하므로 #, **, >, 표 같은 마크다운 서식을 쓰지 말고 평문으로 작성하세요.",
      "핵심만 간결하게, 대략 5~7문장 안으로 답하세요.",
      "",
      "[실제 구매 고객 리뷰 데이터]",
      "{reviews}",
    ].join("\n"),
  ],
  new MessagesPlaceholder("history"),
  ["human", "{question}"],
]);

/** 검색 결과를 `[리뷰 N] ★{rating} {title} — {content} (작성자: {author})` 형식의 줄로 만든다. */
export function formatContext(sources: SourceReview[]): string {
  return sources
    .map((s, i) => `[리뷰 ${i + 1}] ★${s.rating} ${s.title} — ${s.content} (작성자: ${s.author})`)
    .join("\n");
}

/** 최근 HISTORY_LIMIT개를 메시지 객체로 변환한다(템플릿 변수로 해석되지 않도록). */
function toHistoryMessages(history: ChatMessage[]): BaseMessage[] {
  const recent = history.slice(-HISTORY_LIMIT);
  // 모델 입력은 사용자 메시지로 시작해야 하므로 앞쪽의 assistant 메시지는 버린다.
  const start = recent.findIndex((m) => m.role === "user");
  return (start === -1 ? [] : recent.slice(start)).map((m) =>
    m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content),
  );
}

export interface GenerateAnswerParams {
  question: string;
  sources: SourceReview[];
  /** 현재 질문을 제외한 이전 대화 */
  history: ChatMessage[];
}

/**
 * 검색된 리뷰만을 근거로 답변을 생성한다.
 * 검색 결과가 없으면 모델을 만들지도 호출하지도 않고 고정 안내 문구를 돌려준다.
 */
export async function generateAnswer(
  { question, sources, history }: GenerateAnswerParams,
  createChatModel: () => ChatModel = createModel,
): Promise<string> {
  if (sources.length === 0) return NO_RESULT_ANSWER;

  const chain = prompt.pipe(createChatModel()).pipe(new StringOutputParser());
  const answer = await chain.invoke({
    reviews: formatContext(sources),
    history: toHistoryMessages(history),
    question,
  });
  return answer.trim();
}
