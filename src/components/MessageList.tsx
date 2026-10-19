"use client";

import { Bot, Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import MessageBubble from "@/components/MessageBubble";
import type { ChatItem } from "@/lib/types";

const EXAMPLE_QUESTIONS = [
  "배터리는 얼마나 가나요?",
  "착용감은 어때요?",
  "통화 품질에 대한 불만이 있나요?",
  "노이즈캔슬링 성능을 요약해줘",
];

interface MessageListProps {
  items: ChatItem[];
  pending: boolean;
  onPickExample: (question: string) => void;
}

export default function MessageList({ items, pending, onPickExample }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  // 새 메시지나 대기 표시가 생기면 최신 위치로 이동한다.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [items, pending]);

  return (
    <div role="log" aria-live="polite" aria-label="대화" className="flex-1 overflow-y-auto px-4 py-5">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {items.length === 0 && !pending && (
          <div data-testid="empty-state" className="flex flex-col items-center gap-4 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
              <Bot aria-hidden className="size-6" />
            </span>
            <div>
              <p className="font-semibold">리뷰에 대해 무엇이든 물어보세요</p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                먼저 [샘플 데이터 인덱싱] 버튼으로 리뷰를 불러온 뒤 질문을 입력하세요.
              </p>
            </div>
            <ul className="flex flex-wrap justify-center gap-2">
              {EXAMPLE_QUESTIONS.map((question) => (
                <li key={question}>
                  <button
                    type="button"
                    onClick={() => onPickExample(question)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <Sparkles aria-hidden className="size-3.5 text-indigo-600" />
                    {question}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {items.map((item) => (
          <MessageBubble key={item.id} item={item} />
        ))}

        {pending && (
          <div data-testid="pending" className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
              <Loader2 aria-hidden className="size-4 animate-spin" />
            </span>
            리뷰를 분석하는 중…
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  );
}
