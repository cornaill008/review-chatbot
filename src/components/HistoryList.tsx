import { History, Inbox, MessageCircleQuestion } from "lucide-react";

interface HistoryListProps {
  items: string[];
  onSelect: (question: string) => void;
}

export default function HistoryList({ items, onSelect }: HistoryListProps) {
  return (
    <section aria-labelledby="history-heading" className="flex min-h-0 flex-1 flex-col gap-2">
      <h2
        id="history-heading"
        className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-zinc-500 dark:text-zinc-400"
      >
        <History aria-hidden className="size-3.5" />
        최근 분석 질문
      </h2>

      {items.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          <Inbox aria-hidden className="size-4 shrink-0" />
          아직 질문이 없어요
        </p>
      ) : (
        <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          {items.map((question) => (
            <li key={question}>
              <button
                type="button"
                onClick={() => onSelect(question)}
                title={question}
                className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-200/70 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <MessageCircleQuestion aria-hidden className="mt-0.5 size-4 shrink-0 text-zinc-400" />
                <span className="line-clamp-2">{question}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
