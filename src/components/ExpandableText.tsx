"use client";

import { ChevronDown } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";

/**
 * 기본 2줄까지만 보여주고, 넘칠 때만 "더보기"/"접기" 버튼과 본문 클릭으로 전체를 펼친다.
 * 넘침은 접힌 상태에서 `scrollHeight > clientHeight`로 판단하고, 크기가 바뀔 때(창 너비 변화,
 * 닫혀 있던 아코디언이 열리는 순간)마다 `ResizeObserver`로 다시 잰다.
 */
export default function ExpandableText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const textId = useId();
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return; // 펼친 상태에서는 잘리지 않으므로 잴 수 없다

    const measure = () => setTruncated(el.scrollHeight > el.clientHeight + 1);
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, text]);

  // 펼친 상태에서는 너비가 늘어도 버튼이 사라지지 않게 "접기"를 유지한다.
  const toggleable = truncated || expanded;

  function toggle() {
    setExpanded((value) => !value);
  }

  function handleTextClick() {
    if (window.getSelection()?.toString()) return; // 글자를 드래그해 복사하려는 클릭은 무시
    toggle();
  }

  return (
    <div className="mt-0.5">
      <p
        ref={ref}
        id={textId}
        onClick={toggleable ? handleTextClick : undefined}
        className={`whitespace-pre-wrap break-words text-zinc-600 dark:text-zinc-300 ${
          expanded ? "" : "line-clamp-2"
        } ${toggleable ? "cursor-pointer" : ""}`}
      >
        {text}
      </p>
      {toggleable && (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls={textId}
          className="mt-1 inline-flex items-center gap-0.5 rounded text-xs font-medium text-indigo-600 hover:underline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-indigo-400"
        >
          {expanded ? "접기" : "더보기"}
          <ChevronDown aria-hidden className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  );
}
