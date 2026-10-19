import { Loader2, SendHorizontal } from "lucide-react";
import type { KeyboardEvent, RefObject } from "react";

export const MAX_MESSAGE_LENGTH = 500;

interface ChatInputProps {
  value: string;
  pending: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  onSend: () => void;
}

export default function ChatInput({ value, pending, inputRef, onChange, onSend }: ChatInputProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey) return; // Shift+Enter는 줄바꿈
    // 한글 등 IME 조합 중의 Enter는 조합 확정용이다. 여기서 전송하면 같은 메시지가 두 번 전송된다.
    if (e.nativeEvent.isComposing) return;
    e.preventDefault();
    onSend();
  }

  const canSend = value.trim() !== "" && !pending;

  return (
    <div className="border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          maxLength={MAX_MESSAGE_LENGTH}
          aria-label="질문 입력"
          placeholder="리뷰에 대해 궁금한 점을 입력하세요 (Enter 전송 · Shift+Enter 줄바꿈)"
          className="min-h-12 flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="질문 전송"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? (
            <Loader2 aria-hidden className="size-5 animate-spin" />
          ) : (
            <SendHorizontal aria-hidden className="size-5" />
          )}
        </button>
      </div>
    </div>
  );
}
