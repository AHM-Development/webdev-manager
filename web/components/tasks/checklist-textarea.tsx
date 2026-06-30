"use client";

import { TextArea } from "@heroui/react";
import { useLayoutEffect, useRef } from "react";

export function ChecklistTextArea({
  value,
  completed = false,
  ariaLabel,
  onChange,
}: {
  value: string;
  completed?: boolean;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <TextArea
      ref={ref}
      rows={1}
      value={value}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      className={`min-h-6 min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent p-0 text-sm leading-5 shadow-none ${
        completed ? "text-slate-400 line-through" : "text-slate-800"
      }`}
    />
  );
}
