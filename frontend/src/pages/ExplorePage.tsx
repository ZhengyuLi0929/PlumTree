import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BottomNav, TopBar } from "../components/ui/AppChrome";
import { InkstoneTextarea } from "../components/ui/InkstoneTextarea";
import { SealButton } from "../components/ui/SealButton";
import { ZenLoader } from "../components/ui/ZenLoader";
import { getMatchJob, runMatch } from "../lib/api/client";

export function ExplorePage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);

  const runMutation = useMutation({
    mutationFn: runMatch,
    onSuccess: (data) => setJobId(data.job_id),
  });

  const jobQuery = useQuery({
    queryKey: ["match-job", jobId],
    queryFn: () => getMatchJob(jobId!),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      if (!s || s === "pending") return 900;
      if (s === "running") return 1400;
      return false;
    },
  });

  const isBusy = useMemo(() => {
    if (runMutation.isPending) return true;
    return jobQuery.data?.status === "pending" || jobQuery.data?.status === "running";
  }, [jobQuery.data?.status, runMutation.isPending]);

  const first = jobQuery.data?.result?.[0];

  return (
    <div className="min-h-[100dvh] bg-[var(--surface)] pb-32">
      <TopBar title="寻梅" />

      <main className="mx-auto flex w-full max-w-screen-xl flex-col items-center px-5 pb-36 pt-28 md:px-8 md:pt-32">
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -right-24 top-1/4 h-80 w-80 rounded-full bg-[color:rgba(57,101,111,0.06)] blur-[120px]" />
          <div className="absolute -left-20 bottom-1/4 h-64 w-64 rounded-full bg-[color:rgba(86,96,99,0.05)] blur-[90px]" />
        </div>

        <section className="w-full max-w-3xl">
          <div className="mb-14 text-center">
            <h2 className="font-headline text-5xl font-light tracking-tight text-[var(--on-surface)] md:text-7xl">
              寻一位同频之人
            </h2>
            <p className="mt-4 text-[11px] font-medium tracking-[0.28em] text-[var(--primary)]/65">
              以心念为引，向人海寻梅
            </p>
          </div>

          <div className="group relative">
            <InkstoneTextarea
              placeholder="写下你此刻的心念..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <div className="absolute bottom-0 left-0 h-px w-full origin-center scale-x-0 bg-[var(--primary)] transition-transform duration-700 group-focus-within:scale-x-100" />
          </div>

          <div className="mt-8 flex items-center justify-between gap-5">
            <div className="flex gap-6 text-[10px] tracking-[0.18em] text-[var(--on-surface)]/45">
              <button type="button">细化条件</button>
              <Link to="/explore-archive">文库视图</Link>
            </div>
            <SealButton onClick={() => runMutation.mutate({ prompt })} disabled={!prompt.trim() || isBusy}>
              开始寻觅
            </SealButton>
          </div>
        </section>

        {isBusy && (
          <div className="mt-10 w-full max-w-3xl">
            <ZenLoader label="正在进行匹配..." />
          </div>
        )}

        {jobQuery.data?.status === "completed" && (
          <section className="mt-12 w-full max-w-3xl space-y-4">
            {jobQuery.data.result.map((item) => (
              <button
                key={item.profileId}
                className="flex w-full items-center justify-between bg-[var(--surface-container-low)] px-5 py-4 text-left transition hover:bg-[var(--surface-container-lowest)]"
                onClick={() => navigate(`/match/${item.profileId}?prompt=${encodeURIComponent(prompt)}`)}
              >
                <div>
                  <p className="font-headline text-xl">{item.reasonShort}</p>
                  <p className="text-[11px] tracking-[0.15em] text-[var(--on-surface-variant)]">候选对象</p>
                </div>
                <span className="font-headline text-4xl text-[var(--primary)]">{item.score}%</span>
              </button>
            ))}
            {first && (
              <div className="pt-2 text-right">
                <SealButton onClick={() => navigate(`/match-gallery/${first.profileId}?prompt=${encodeURIComponent(prompt)}`)}>
                  查看展卷式详情
                </SealButton>
              </div>
            )}
          </section>
        )}

        <section className="mt-20 grid w-full max-w-3xl grid-cols-1 gap-4 md:grid-cols-3">
          <article className="bg-[var(--surface-container-low)] p-6 transition hover:bg-[var(--surface-container-lowest)]">
            <h3 className="font-headline text-2xl">诗性原型</h3>
            <p className="mt-3 text-[11px] tracking-[0.12em] text-[var(--on-surface-variant)]">
              按气质与文字偏好探索同频的人。
            </p>
          </article>
          <article className="bg-[var(--surface-container-low)] p-6 transition hover:bg-[var(--surface-container-lowest)]">
            <h3 className="font-headline text-2xl">山水语境</h3>
            <p className="mt-3 text-[11px] tracking-[0.12em] text-[var(--on-surface-variant)]">
              通过共同的场景偏好建立连接。
            </p>
          </article>
          <article className="bg-[var(--surface-container-low)] p-6 transition hover:bg-[var(--surface-container-lowest)]">
            <h3 className="font-headline text-2xl">墨韵同好</h3>
            <p className="mt-3 text-[11px] tracking-[0.12em] text-[var(--on-surface-variant)]">
              寻找与你笔触和节奏相近的人。
            </p>
          </article>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
