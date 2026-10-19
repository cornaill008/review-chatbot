"use client";

import { useEffect, useRef, useState } from "react";
import ChatPanel from "@/components/ChatPanel";
import type { ModeBadgeValue } from "@/components/ModeBadge";
import Sidebar from "@/components/Sidebar";
import { getStatus, runIndexing, sendChat } from "@/lib/api-client";
import type { ChatItem, IndexState, StatusData } from "@/lib/types";

const HISTORY_MAX = 10;
const NOT_INDEXED_NOTICE = "먼저 [샘플 데이터 인덱싱] 버튼을 눌러 리뷰를 불러와 주세요.";

type StatusState = { phase: "loading" } | { phase: "error" } | { phase: "ok"; data: StatusData };

export default function Dashboard() {
  const [status, setStatus] = useState<StatusState>({ phase: "loading" });
  const [indexState, setIndexState] = useState<IndexState>({ phase: "idle" });
  const [items, setItems] = useState<ChatItem[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);
  // 같은 화면에서 이어지는 질문은 같은 대화로 묶는다. 렌더 중에 난수를 쓰지 않도록 첫 전송 때 만든다.
  const chatId = useRef<string | null>(null);

  // 화면을 열거나 새로고침할 때 서버의 모드와 인덱싱 상태를 가져온다.
  useEffect(() => {
    let cancelled = false;
    getStatus().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setStatus({ phase: "error" });
        return;
      }
      setStatus({ phase: "ok", data: result.data });
      if (result.data.indexed) setIndexState({ phase: "done", count: result.data.count });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const modeBadge: ModeBadgeValue =
    status.phase === "ok" ? status.data.mode : status.phase === "loading" ? "loading" : "unknown";
  const indexed = indexState.phase === "done";

  function addItem(kind: ChatItem["kind"], content: string, sources?: ChatItem["sources"]) {
    const item: ChatItem = { id: nextId.current++, kind, content, sources };
    setItems((prev) => [...prev, item]);
  }

  async function handleIndex() {
    if (indexState.phase === "loading") return;
    setIndexState({ phase: "loading" });
    const result = await runIndexing();
    setIndexState(
      result.ok ? { phase: "done", count: result.data.indexed } : { phase: "error", error: result.error },
    );
  }

  async function handleSend() {
    const question = draft.trim();
    if (!question || pending) return;

    if (!indexed) {
      addItem("notice", NOT_INDEXED_NOTICE);
      return;
    }

    addItem("user", question);
    setDraft("");
    setHistory((prev) => [question, ...prev.filter((q) => q !== question)].slice(0, HISTORY_MAX));
    setPending(true);

    chatId.current ??= crypto.randomUUID();
    const result = await sendChat(question, chatId.current);
    setPending(false);
    if (result.ok) addItem("assistant", result.data.answer, result.data.sources);
    else addItem("error", result.error);
  }

  // 히스토리·예시 질문은 입력창에 채우기만 하고 전송하지 않는다.
  function fillDraft(question: string) {
    setDraft(question);
    inputRef.current?.focus();
  }

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 text-zinc-900 md:flex-row dark:bg-zinc-950 dark:text-zinc-100">
      <Sidebar
        mode={modeBadge}
        indexState={indexState}
        history={history}
        onIndex={handleIndex}
        onSelectHistory={fillDraft}
      />
      <ChatPanel
        items={items}
        pending={pending}
        draft={draft}
        inputRef={inputRef}
        onDraftChange={setDraft}
        onSend={handleSend}
        onPickExample={fillDraft}
      />
    </div>
  );
}
