import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLanguage } from "../app/language";
import { BottomNav, TopBar } from "../components/ui/AppChrome";
import { PlumTransitionOverlay } from "../components/ui/PlumTransitionOverlay";
import { SealButton } from "../components/ui/SealButton";
import { profiles } from "../lib/api/mockData";

export function MatchGalleryPage() {
  const { tx } = useLanguage();
  const navigate = useNavigate();
  const { profileId = "p-ruoyun" } = useParams();
  const profile = profiles.find((item) => item.id === profileId) ?? profiles[0];
  const [isTransitioning, setIsTransitioning] = useState(false);
  const nextProfileId = profiles[(profiles.findIndex((item) => item.id === profile.id) + 1) % profiles.length]?.id;

  const onStartChat = () => {
    if (!nextProfileId) return;
    setIsTransitioning(true);
    window.setTimeout(() => {
      navigate(`/match-gallery/${nextProfileId}`, { state: { fromSection: "explore" } });
      setIsTransitioning(false);
    }, 1250);
  };

  return (
    <div className="min-h-[100dvh] bg-[var(--surface)] pb-32">
      <PlumTransitionOverlay visible={isTransitioning} />
      <TopBar title={tx("寻梅", "Seeking Plum")} leftIcon="arrow_back" />

      <main className="mx-auto max-w-screen-xl px-5 pb-36 pt-24 md:px-12">
        <section className="mt-8 flex flex-col gap-10 md:flex-row md:items-start">
          <div className="mx-auto w-full max-w-[420px] border border-[var(--outline-variant)]/20 p-2 md:mx-0">
            <img alt={profile.displayName} className="h-[60vh] min-h-[360px] w-full object-cover grayscale-[15%]" src={profile.avatar} />
            <div className="-mt-3 ml-auto w-fit bg-[var(--primary)] px-4 py-2 font-headline text-lg text-white">{profile.displayName}</div>
          </div>
          <div className="flex-1 space-y-10 md:pt-8">
            <div>
              <h1 className="font-headline text-5xl leading-tight md:text-7xl">
                {tx("静意在", "Quietude in")} <span className="text-[var(--primary)] italic">{tx("烟雨中生长。", "Lingering Mist.")}</span>
              </h1>
              <div className="mt-5 h-px w-24 bg-[var(--primary)]/35" />
            </div>

            <section className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-[10px] tracking-[0.2em] text-[var(--on-surface-variant)]/60">{tx("居所", "Origin")}</p>
                <p className="mt-2 text-lg">{profile.city}</p>
              </div>
              <div>
                <p className="text-[10px] tracking-[0.2em] text-[var(--on-surface-variant)]/60">{tx("志业", "Calling")}</p>
                <p className="mt-2 text-lg">{profile.calling}</p>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4">
              <article className="bg-[var(--surface-container-lowest)] p-6">
                <p className="text-[10px] tracking-[0.22em] text-[var(--on-surface-variant)]/60">{tx("同频强度", "Frequency Match")}</p>
                <p className="mt-3 text-sm text-[var(--on-surface-variant)]">
                  {tx(
                    "契合度达到 94%。你们都倾向细腻、耐心、可持续的关系建立方式。",
                    "Resonance reaches 94%. You both prefer careful and sustainable connection.",
                  )}
                </p>
              </article>
              <article className="bg-[var(--surface-container-lowest)] p-6">
                <p className="text-[10px] tracking-[0.22em] text-[var(--on-surface-variant)]/60">{tx("沉默兼容性", "Shared Silence")}</p>
                <p className="mt-3 text-sm text-[var(--on-surface-variant)]">
                  {tx(
                    "在不说话的时刻依旧舒适，适合共读、煮茶、并肩散步等场景。",
                    "Comfort remains in silence, ideal for reading, tea, and quiet walks.",
                  )}
                </p>
              </article>
            </section>
          </div>
        </section>

        <section className="mt-14 space-y-5">
          <h2 className="font-headline text-4xl">{tx("本质画像", "Essence")}</h2>
          <div className="space-y-3">
            <div className="border-b border-[var(--outline-variant)]/25 py-4">
              {tx("哲学观 - 以宋人眼光理解侘寂之美。", "Philosophy - Wabi-sabi through a Song lens.")}
            </div>
            <div className="border-b border-[var(--outline-variant)]/25 py-4">
              {tx("氛围感 - 晨雾、檀香、手作纸张。", "Atmosphere - morning mist, incense, handmade paper.")}
            </div>
            <div className="border-b border-[var(--outline-variant)]/25 py-4">
              {tx("近期关注 - 北宋晚期山水技法。", "Current Study - late Northern Song landscape techniques.")}
            </div>
          </div>
        </section>

        <div className="mt-16 text-center">
          <SealButton onClick={onStartChat}>{tx("开启对话", "Connect")}</SealButton>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
