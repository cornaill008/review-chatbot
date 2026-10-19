import { ChatAnthropic } from "@langchain/anthropic";
import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";
import type { BasePromptValueInterface } from "@langchain/core/prompt_values";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import type { Runnable } from "@langchain/core/runnables";
import type { ChatMessage, SourceReview } from "@/lib/types";

export const MODEL_ID = "claude-haiku-4-5";
export const HISTORY_LIMIT = 6;
export const NO_RESULT_ANSWER =
  "질문과 관련된 리뷰를 찾지 못했습니다. 상품의 배터리, 음질, 착용감처럼 다른 표현으로 질문해 주세요.";

export class MissingApiKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY가 설정되지 않았습니다. .env.local에 API 키를 설정해 주세요.");
    this.name = "MissingApiKeyError";
  }
}

export type ChatModel = Runnable<BasePromptValueInterface, BaseMessage>;

/** 공백뿐인 값도 "키 없음"으로 본다. */
export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function createModel(): ChatModel {
  if (!hasApiKey()) throw new MissingApiKeyError();
  return new ChatAnthropic({
    model: MODEL_ID,
    apiKey: process.env.ANTHROPIC_API_KEY!.trim(),
    temperature: 0.2,
    maxTokens: 1024,
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
