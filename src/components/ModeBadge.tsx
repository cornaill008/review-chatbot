import { CircleHelp, Database, FlaskConical, Loader2 } from "lucide-react";
import type { DataMode } from "@/lib/types";

export type ModeBadgeValue = DataMode | "loading" | "unknown";

const BADGES = {
  mock: {
    label: "Mock 모드",
    Icon: FlaskConical,
    className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  },
  real: {
    label: "실데이터 모드",
    Icon: Database,
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  loading: {
    label: "확인 중",
    Icon: Loader2,
    className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  },
  unknown: {
    label: "모드 확인 불가",
    Icon: CircleHelp,
    className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  },
} as const;

/** 서버가 알려준 모드를 라벨로 바꿔 보여줄 뿐, 모드를 스스로 판단하지 않는다. */
export default function ModeBadge({ mode }: { mode: ModeBadgeValue }) {
  const { label, Icon, className } = BADGES[mode];
  return (
    <span
      data-testid="mode-badge"
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${className}`}
    >
      <Icon aria-hidden className={`size-3.5 ${mode === "loading" ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}
