import type { RefObject } from "react";
import ChatInput from "@/components/ChatInput";
import MessageList from "@/components/MessageList";
import ProductBanner from "@/components/ProductBanner";
import type { ChatItem } from "@/lib/types";

interface ChatPanelProps {
  items: ChatItem[];
  pending: boolean;
  draft: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onPickExample: (question: string) => void;
}

export default function ChatPanel({
  items,
  pending,
  draft,
  inputRef,
  onDraftChange,
  onSend,
  onPickExample,
}: ChatPanelProps) {
  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ProductBanner />
      <MessageList items={items} pending={pending} onPickExample={onPickExample} />
      <ChatInput value={draft} pending={pending} inputRef={inputRef} onChange={onDraftChange} onSend={onSend} />
    </main>
  );
}
