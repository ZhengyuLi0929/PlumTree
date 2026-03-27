import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { useLanguage } from "../../app/language";

type TopBarProps = {
  title?: string;
  subtitle?: string;
  leftIcon?: string;
  rightSlot?: ReactNode;
  onLeftClick?: () => void;
};

const tabs = [
  { to: "/explore", labelZh: "探索", labelEn: "Explore", icon: "explore" },
  { to: "/mind", labelZh: "心念", labelEn: "Mind", icon: "self_improvement" },
  { to: "/echoes", labelZh: "回响", labelEn: "Echoes", icon: "auto_awesome" },
  { to: "/profile", labelZh: "我", labelEn: "Profile", icon: "person" },
];

function getSection(pathname: string): "explore" | "mind" | "echoes" | "profile" | null {
  if (pathname.startsWith("/explore") || pathname.startsWith("/match")) return "explore";
  if (pathname.startsWith("/mind")) return "mind";
  if (pathname.startsWith("/echoes")) return "echoes";
  if (pathname.startsWith("/profile")) return "profile";
  return null;
}

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
  const { lang, setLang, tx } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const section = getSection(location.pathname);
  const isSectionRoot =
    location.pathname === "/explore" || location.pathname === "/mind" || location.pathname === "/echoes" || location.pathname === "/profile";
  const fromSection = (location.state as { fromSection?: string } | null)?.fromSection;
  const canBackInSection = Boolean(section && !isSectionRoot && fromSection === section);
  const effectiveIcon = canBackInSection ? leftIcon : "menu";

  const handleBack = () => {
    if (onLeftClick) {
      onLeftClick();
      return;
    }
    if (canBackInSection) {
      navigate(-1);
      return;
    }
    setMenuOpen(true);
  };

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 bg-[var(--surface)]/95 px-4 py-4 backdrop-blur md:px-8 md:py-6">
        <div className="mx-auto flex w-full max-w-screen-xl items-center justify-between">
          <button
            className={`material-symbols-outlined p-1 text-[var(--primary)] ${!canBackInSection ? "opacity-70" : ""}`}
            onClick={handleBack}
            type="button"
            aria-label={tx("返回", "Back")}
          >
            {effectiveIcon}
          </button>
          <div className="text-center">
            <h1 className="font-headline text-2xl font-light tracking-tight text-[var(--primary)] md:text-3xl">{title}</h1>
            {subtitle && <p className="text-[10px] tracking-[0.2em] text-[var(--on-surface-variant)]">{subtitle}</p>}
          </div>
          <div className="h-10 w-10 overflow-hidden bg-[var(--surface-container)]">{rightSlot ?? <AppLogoMini />}</div>
        </div>
        <div className="mt-3 h-px w-full bg-gradient-to-r from-transparent via-[color:rgba(57,101,111,0.15)] to-transparent" />
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-[70] flex">
          <aside className="h-full w-[76%] max-w-xs bg-[var(--surface-container-lowest)] p-6 shadow-[10px_0_30px_rgba(57,101,111,0.08)]">
            <div className="mb-8 flex items-center justify-between">
              <h3 className="font-headline text-3xl text-[var(--primary)]">{tx("设置", "Settings")}</h3>
              <button className="material-symbols-outlined text-[var(--on-surface-variant)]" onClick={() => setMenuOpen(false)} type="button">
                close
              </button>
            </div>
            <section className="space-y-4">
              <p className="text-xs tracking-[0.15em] text-[var(--on-surface-variant)]">{tx("语言", "Language")}</p>
              <div className="flex gap-2">
                <button
                  className={`px-4 py-2 text-sm ${lang === "zh" ? "bg-[var(--primary)] text-white" : "bg-[var(--surface-container)]"}`}
                  type="button"
                  onClick={() => setLang("zh")}
                >
                  中文
                </button>
                <button
                  className={`px-4 py-2 text-sm ${lang === "en" ? "bg-[var(--primary)] text-white" : "bg-[var(--surface-container)]"}`}
                  type="button"
                  onClick={() => setLang("en")}
                >
                  English
                </button>
              </div>
            </section>
          </aside>
          <button
            className="h-full flex-1 bg-[color:rgba(25,28,29,0.26)]"
            type="button"
            aria-label={tx("关闭菜单", "Close menu")}
            onClick={() => setMenuOpen(false)}
          />
        </div>
      )}
    </>
  );
}

export function BottomNav() {
  const location = useLocation();
  const { tx } = useLanguage();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-md items-center justify-around border-t border-[color:rgba(57,101,111,0.12)] bg-[color:rgba(255,255,255,0.66)] px-6 pb-[calc(0.36rem+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur md:bottom-5 md:w-[90%]">
      {tabs.map((tab) => {
        const active = location.pathname.startsWith(tab.to);
        return (
          <Link
            key={tab.to}
            className={`flex flex-col items-center justify-center gap-0.5 transition ${
              active ? "text-[var(--primary)]" : "text-[color:rgba(25,28,29,0.42)]"
            }`}
            to={tab.to}
          >
            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
            <span className="text-[9px] tracking-[0.14em]">{tx(tab.labelZh, tab.labelEn)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
