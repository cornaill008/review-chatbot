"use client";

import { ChevronDown, MessageSquareText } from "lucide-react";
import { useState } from "react";
import HistoryList from "@/components/HistoryList";
import IndexButton from "@/components/IndexButton";
import ModeBadge, { type ModeBadgeValue } from "@/components/ModeBadge";
import type { IndexState } from "@/lib/types";

interface SidebarProps {
  mode: ModeBadgeValue;
  indexState: IndexState;
  history: string[];
  onIndex: () => void;
  onSelectHistory: (question: string) => void;
}

export default function Sidebar({ mode, indexState, history, onIndex, onSelectHistory }: SidebarProps) {
  // 좁은 화면에서는 히스토리 목록만 접어 둘 수 있다(인덱싱 버튼은 항상 보인다). md 이상에서는 항상 펼쳐진다.
  const [open, setOpen] = useState(false);

  return (
    <aside className="flex shrink-0 flex-col gap-4 border-b border-zinc-200 bg-white p-4 md:h-full md:w-72 md:border-r md:border-b-0 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="flex items-center gap-2 text-base font-bold">
            <MessageSquareText aria-hidden className="size-5 shrink-0 text-indigo-600" />
            쇼핑 리뷰 AI 분석기
          </h1>
          <div>
            <ModeBadge mode={mode} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="sidebar-history"
          aria-label={open ? "최근 질문 접기" : "최근 질문 펼치기"}
          className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 md:hidden dark:hover:bg-zinc-800"
        >
          <ChevronDown aria-hidden className={`size-5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      <IndexButton state={indexState} onClick={onIndex} />

      <div id="sidebar-history" className={`${open ? "flex" : "hidden"} min-h-0 flex-1 flex-col md:flex`}>
        <HistoryList items={history} onSelect={onSelectHistory} />
      </div>
    </aside>
  );
}
