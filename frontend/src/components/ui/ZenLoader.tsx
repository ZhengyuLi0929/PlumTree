export function ZenLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10">
      <div className="zen-loader h-2 w-60" />
      <span className="text-[10px] tracking-[0.28em] text-[var(--on-surface-variant)]">
        {label ?? "卷轴徐徐展开..."}
      </span>
    </div>
  );
}
