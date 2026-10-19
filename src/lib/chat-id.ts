/** `chatId`를 생략한 요청이 공유하는 기본 대화의 id (Mock·실데이터 저장소 공통) */
export const DEFAULT_CHAT_ID = "default";

/** 앞뒤 공백을 자르고, 비어 있거나 없으면 기본 대화 id를 쓴다. */
export function normalizeChatId(chatId: string | undefined | null): string {
  return chatId?.trim() || DEFAULT_CHAT_ID;
}
