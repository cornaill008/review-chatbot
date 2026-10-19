import { AlertCircle, CheckCircle2, DatabaseZap, Loader2 } from "lucide-react";
import type { IndexState } from "@/lib/types";

interface IndexButtonProps {
  state: IndexState;
  onClick: () => void;
}

export default function IndexButton({ state, onClick }: IndexButtonProps) {
  const loading = state.phase === "loading";

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        aria-busy={loading}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <DatabaseZap aria-hidden className="size-4" />
        )}
        샘플 데이터 인덱싱
      </button>

      <p role="status" aria-live="polite" className="min-h-5 text-xs">
        {loading && <span className="text-zinc-500 dark:text-zinc-400">인덱싱 중입니다…</span>}
        {state.phase === "done" && (
          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 aria-hidden className="size-3.5" />
            인덱싱 완료 · 리뷰 {state.count}건
          </span>
        )}
        {state.phase === "error" && (
          <span className="inline-flex items-start gap-1 text-red-600 dark:text-red-400">
            <AlertCircle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {state.error}
          </span>
        )}
      </p>
    </div>
  );
}
