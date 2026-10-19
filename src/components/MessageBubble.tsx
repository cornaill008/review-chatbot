import { Bot, Info, TriangleAlert, User } from "lucide-react";
import SourceAccordion from "@/components/SourceAccordion";
import type { ChatItem } from "@/lib/types";

export default function MessageBubble({ item }: { item: ChatItem }) {
  if (item.kind === "user") {
    return (
      <div className="flex items-start justify-end gap-2" data-testid="message-user">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-sm text-white">
          {item.content}
        </p>
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          <User aria-hidden className="size-4" />
        </span>
      </div>
    );
  }

  const tone =
    item.kind === "error"
      ? { Icon: TriangleAlert, avatar: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400", bubble: "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300" }
      : item.kind === "notice"
        ? { Icon: Info, avatar: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", bubble: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200" }
        : { Icon: Bot, avatar: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300", bubble: "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900" };

  return (
    <div className="flex items-start gap-2" data-testid={`message-${item.kind}`}>
      <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${tone.avatar}`}>
        <tone.Icon aria-hidden className="size-4" />
      </span>
      <div className="min-w-0 max-w-[85%]">
        <p
          role={item.kind === "error" ? "alert" : undefined}
          className={`whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm border px-4 py-2.5 text-sm ${tone.bubble}`}
        >
          {item.content}
        </p>
        {item.kind === "assistant" && item.sources && <SourceAccordion sources={item.sources} />}
      </div>
    </div>
  );
}
