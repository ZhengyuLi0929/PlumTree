import { type TextareaHTMLAttributes } from "react";

export function InkstoneTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className="w-full resize-none border-0 border-b border-[var(--outline-variant)]/50 bg-transparent py-6 text-2xl italic text-[var(--on-surface)] outline-none transition focus:border-[var(--primary)]"
      rows={4}
      {...props}
    />
  );
}
