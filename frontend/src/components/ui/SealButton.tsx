import { type ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

export function SealButton({ className = "", variant = "primary", ...props }: Props) {
  const base = "px-6 py-3 text-xs tracking-[0.25em] transition active:scale-[0.98] disabled:opacity-60";
  const style =
    variant === "primary"
      ? "bg-[var(--primary)] text-white hover:opacity-90"
      : "border border-[var(--outline-variant)] text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]";

  return <button className={`${base} ${style} ${className}`} {...props} />;
}
