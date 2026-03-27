import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useLanguage } from "../app/language";
import { BottomNav, TopBar } from "../components/ui/AppChrome";
import { PlumTransitionOverlay } from "../components/ui/PlumTransitionOverlay";
import { SealButton } from "../components/ui/SealButton";
import { ZenLoader } from "../components/ui/ZenLoader";
import { getEcho, getProfile } from "../lib/api/client";
import { profiles } from "../lib/api/mockData";

export function MatchDetailPage() {
  const { tx } = useLanguage();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const { profileId = "" } = useParams();
  const prompt = search.get("prompt") ?? "";
  const [isTransitioning, setIsTransitioning] = useState(false);

  const profileQuery = useQuery({
    queryKey: ["profile", profileId],
    queryFn: () => getProfile(profileId),
  });
  const echoQuery = useQuery({
    queryKey: ["echo", profileId, prompt],
    queryFn: () => getEcho(profileId, prompt),
  });

  const score = useMemo(() => echoQuery.data?.score ?? 0, [echoQuery.data?.score]);

  if (profileQuery.isLoading || echoQuery.isLoading) {
    return (
      <div className="min-h-[100dvh] bg-[var(--surface)] pt-24">
        <ZenLoader label="正在生成回响..." />
      </div>
    );
  }

  if (!profileQuery.data || !echoQuery.data) {
    return <p className="p-6">未找到该资料。</p>;
  }

  const profile = profileQuery.data;
  const echo = echoQuery.data;
  const nextProfileId = profiles[(profiles.findIndex((item) => item.id === profile.id) + 1) % profiles.length]?.id;

  const onStartChat = () => {
    if (!nextProfileId) return;
    setIsTransitioning(true);
    window.setTimeout(() => {
      navigate(`/match/${nextProfileId}?prompt=${encodeURIComponent(prompt)}`, { state: { fromSection: "explore" } });
      setIsTransitioning(false);
    }, 1250);
  };

  return (
    <div className="min-h-[100dvh] bg-[var(--surface)] pb-32">
      <TopBar title={tx("寻梅", "Seeking Plum")} />
      <PlumTransitionOverlay visible={isTransitioning} />

      <main className="mx-auto max-w-screen-xl px-5 pb-36 pt-24 md:px-10 md:pt-28">
        <section className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-[3fr_2fr] md:items-start">
          <div className="bg-[var(--surface-container)] p-3">
            <img alt={profile.displayName} className="h-[58vh] min-h-[360px] w-full object-cover" src={profile.avatar} />
          </div>
          <div className="md:pt-10">
            <h1 className="font-headline text-6xl leading-tight tracking-tight text-[var(--primary)]">
              识君
              <span className="mt-2 block text-2xl font-light tracking-[0.12em]">{tx("与君初识", "Meeting You")}</span>
            </h1>
            <div className="mt-6 flex items-baseline gap-3">
              <span className="font-headline text-4xl">{profile.displayName}</span>
              <span className="text-[10px] tracking-[0.2em] text-[var(--on-surface-variant)]">{profile.city}</span>
            </div>
            <p className="mt-4 text-[var(--on-surface-variant)]">{profile.bio}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {profile.interests.map((tag) => (
                <span key={tag} className="border border-[var(--outline-variant)]/35 px-3 py-1 text-[10px] tracking-[0.15em]">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-16 bg-[var(--surface-container-low)] p-8 text-center md:p-14">
          <h3 className="text-[11px] tracking-[0.3em] text-[var(--primary)]">{tx("契合度分析", "Compatibility Analysis")}</h3>
          <p className="font-headline text-[5.5rem] leading-none text-[var(--primary)] md:text-[8rem]">{score}%</p>
          <p className="font-headline text-2xl italic text-[var(--on-surface-variant)]">{tx("同频共振", "Resonant Frequency")}</p>
          <div className="mt-9 grid grid-cols-1 gap-8 border-t border-[var(--outline-variant)]/30 pt-8 text-left md:grid-cols-3">
            <article>
              <p className="text-[10px] tracking-[0.2em] text-[var(--primary)]/70">{tx("认知契合", "Intellectual Alignment")}</p>
              <p className="mt-2 text-sm text-[var(--on-surface-variant)]">{echo.frequencyMatch}</p>
            </article>
            <article>
              <p className="text-[10px] tracking-[0.2em] text-[var(--primary)]/70">{tx("审美协同", "Aesthetic Synergy")}</p>
              <p className="mt-2 text-sm text-[var(--on-surface-variant)]">{echo.sharedSilence}</p>
            </article>
            <article>
              <p className="text-[10px] tracking-[0.2em] text-[var(--primary)]/70">{tx("情绪节奏", "Emotional Temperament")}</p>
              <p className="mt-2 text-sm text-[var(--on-surface-variant)]">
                {tx("你们都偏好沉静但有深度的长对话方式。", "Both of you prefer calm but deep long-form conversations.")}
              </p>
            </article>
          </div>
        </section>

        <section className="mt-16 space-y-4">
          <h3 className="font-headline text-4xl">{tx("本质画像", "Essence")}</h3>
          <ul className="space-y-2">
            {echo.essence.map((line) => (
              <li key={line} className="border-b border-[var(--outline-variant)]/20 py-4 text-[var(--on-surface-variant)]">
                {line}
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-16 text-center">
          <SealButton onClick={onStartChat}>{tx("开启对话", "Begin Echo")}</SealButton>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
