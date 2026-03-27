export function PlumTransitionOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[80] overflow-hidden bg-[color:rgba(248,250,251,0.55)] backdrop-blur-[1px]">
      <div className="absolute inset-0 animate-[plumfade_1.2s_ease-in-out_forwards] bg-gradient-to-b from-[color:rgba(236,238,239,0.1)] to-[color:rgba(236,238,239,0.95)]" />
      <div className="absolute inset-0">
        {Array.from({ length: 14 }).map((_, idx) => (
          <span
            key={idx}
            className="absolute text-xl text-[var(--primary)]/70 animate-[plumfall_1.2s_ease-in_forwards]"
            style={{
              left: `${8 + ((idx * 13) % 86)}%`,
              top: `${-10 - ((idx * 7) % 35)}%`,
              animationDelay: `${(idx % 6) * 80}ms`,
            }}
          >
            ✿
          </span>
        ))}
      </div>
      <div className="absolute inset-x-0 top-[42%] text-center">
        <p className="font-headline text-4xl text-[var(--primary)]">赠你一枝梅</p>
      </div>
    </div>
  );
}
