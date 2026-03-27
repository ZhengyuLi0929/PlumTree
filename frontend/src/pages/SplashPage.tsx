import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export function SplashPage() {
  const navigate = useNavigate();
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const exitTimer = setTimeout(() => setIsExiting(true), 1700);
    const navTimer = setTimeout(() => navigate("/explore"), 2300);
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(navTimer);
    };
  }, [navigate]);

  return (
    <main
      className={`ink-wash-gradient relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden px-6 transition-all duration-700 ${
        isExiting ? "opacity-0 blur-[1px]" : "opacity-100"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 opacity-20">
        <div className="absolute left-[-14%] top-[-10%] h-[42%] w-[68%] rounded-full bg-[color:rgba(172,217,229,0.35)] blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[36%] w-[54%] rounded-full bg-[color:rgba(215,225,228,0.42)] blur-[100px]" />
      </div>
      <div className="absolute right-4 top-4 z-20 h-10 w-10 bg-[var(--surface-container)] p-1">
        <svg className="h-full w-full stroke-[var(--primary)]" fill="none" strokeWidth="0.9" viewBox="0 0 100 100">
          <path d="M50 10 C 70 10, 90 30, 90 50 C 90 70, 70 90, 50 90 C 30 90, 10 70, 10 50 C 10 30, 30 10, 50 10" />
          <path d="M35 50 L 65 50" />
          <path d="M50 35 L 50 65" />
        </svg>
      </div>

      <div className="relative z-10 mb-12 flex h-28 w-28 items-center justify-center md:h-32 md:w-32">
        <svg className="h-full w-full stroke-[var(--primary)]" fill="none" strokeWidth="0.75" viewBox="0 0 100 100">
          <path d="M50 10 C 70 10, 90 30, 90 50 C 90 70, 70 90, 50 90 C 30 90, 10 70, 10 50 C 10 30, 30 10, 50 10" />
          <path d="M35 50 L 65 50" />
          <path d="M50 35 L 50 65" />
          <path d="M20 20 L 25 20 M 20 20 L 20 25" />
          <path d="M80 80 L 75 80 M 80 80 L 80 75" />
        </svg>
      </div>

      <div className="relative z-10 space-y-3 text-center">
        <h1 className="font-headline text-[2rem] font-extralight tracking-tight text-[var(--primary)] md:text-5xl">
          寻梅
        </h1>
        <p className="text-[9px] tracking-[0.35em] text-[var(--on-surface-variant)]/70 md:text-[10px]">
          云水书院
        </p>
      </div>

      <div className="relative z-10 mt-20 flex flex-col items-center gap-5">
        <div className="relative h-24 w-px overflow-hidden bg-[var(--outline-variant)]/60">
          <div className="absolute inset-x-0 top-0 h-10 animate-[splashline_1.8s_ease-in-out_infinite] bg-[var(--primary)]" />
        </div>
        <span className="text-[9px] tracking-[0.2em] text-[var(--on-surface-variant)]/70">卷轴徐徐展开...</span>
      </div>

      <div className="absolute bottom-10 left-0 right-0 z-10 flex items-end justify-between px-8">
        <div className="h-px w-20 bg-[var(--outline-variant)]/30" />
        <div className="text-[9px] tracking-wide text-[var(--on-surface-variant)]/35">宋韵雅意</div>
        <div className="h-px w-20 bg-[var(--outline-variant)]/30" />
      </div>
    </main>
  );
}
