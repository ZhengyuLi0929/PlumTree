import { Link, useLocation, useNavigate } from "react-router-dom";
import { type ReactNode } from "react";

type TopBarProps = {
  title?: string;
  subtitle?: string;
  leftIcon?: string;
  rightSlot?: ReactNode;
  onLeftClick?: () => void;
};

const tabs = [
  { to: "/explore", label: "探索", icon: "explore" },
  { to: "/echoes", label: "回响", icon: "auto_awesome" },
  { to: "/profile", label: "我", icon: "person" },
];

function AppLogoMini() {
  return (
    <svg className="h-full w-full p-1.5" fill="none" stroke="var(--primary)" strokeWidth="0.9" viewBox="0 0 100 100">
      <path d="M50 10 C 70 10, 90 30, 90 50 C 90 70, 70 90, 50 90 C 30 90, 10 70, 10 50 C 10 30, 30 10, 50 10" />
      <path d="M35 50 L 65 50" />
      <path d="M50 35 L 50 65" />
    </svg>
  );
}

export function TopBar({ title = "寻梅", subtitle, leftIcon = "arrow_back", rightSlot, onLeftClick }: TopBarProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onLeftClick) {
      onLeftClick();
      return;
    }
    navigate(-1);
  };

  return (
    <header className="fixed inset-x-0 top-0 z-40 bg-[var(--surface)]/95 px-4 py-4 backdrop-blur md:px-8 md:py-6">
      <div className="mx-auto flex w-full max-w-screen-xl items-center justify-between">
        <button className="material-symbols-outlined p-1 text-[var(--primary)]" onClick={handleBack} type="button" aria-label="返回">
          {leftIcon}
        </button>
        <div className="text-center">
          <h1 className="font-headline text-2xl font-light tracking-tight text-[var(--primary)] md:text-3xl">{title}</h1>
          {subtitle && <p className="text-[10px] tracking-[0.2em] text-[var(--on-surface-variant)]">{subtitle}</p>}
        </div>
        <div className="h-10 w-10 overflow-hidden bg-[var(--surface-container)]">{rightSlot ?? <AppLogoMini />}</div>
      </div>
      <div className="mt-3 h-px w-full bg-gradient-to-r from-transparent via-[color:rgba(57,101,111,0.15)] to-transparent" />
    </header>
  );
}

export function BottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-md items-center justify-around border-t border-[color:rgba(57,101,111,0.12)] bg-[color:rgba(255,255,255,0.66)] px-6 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur md:bottom-6 md:w-[92%] md:rounded-none">
      {tabs.map((tab) => {
        const active = location.pathname.startsWith(tab.to);
        return (
          <Link
            key={tab.to}
            className={`flex flex-col items-center justify-center gap-1 transition ${
              active ? "text-[var(--primary)]" : "text-[color:rgba(25,28,29,0.42)]"
            }`}
            to={tab.to}
          >
            <span className="material-symbols-outlined text-[20px]">{tab.icon}</span>
            <span className="text-[10px] uppercase tracking-[0.16em]">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
