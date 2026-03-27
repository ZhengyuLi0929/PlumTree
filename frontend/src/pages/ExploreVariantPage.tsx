import { useNavigate } from "react-router-dom";
import { BottomNav, TopBar } from "../components/ui/AppChrome";
import { SealButton } from "../components/ui/SealButton";

export function ExploreVariantPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[100dvh] bg-[var(--surface)] pb-32">
      <TopBar title="寻梅" />
      <main className="mx-auto max-w-5xl px-5 pb-36 pt-28 md:px-8 md:pt-32">
        <section className="text-center">
          <h2 className="font-headline text-4xl font-light md:text-6xl">谁是你心中的回响？</h2>
          <p className="mt-3 text-[11px] tracking-[0.3em] text-[var(--primary)]/80">心念所至，回响自来</p>
        </section>

        <section className="relative mx-auto mt-10 w-full max-w-3xl">
          <div className="bg-[var(--surface-container-lowest)] p-1 shadow-[0_10px_30px_-10px_rgba(57,101,111,0.05)]">
            <textarea
              className="min-h-[200px] w-full resize-none border-0 bg-transparent p-8 font-headline text-3xl italic outline-none"
              placeholder="请输入你的心念..."
            />
            <div className="flex items-center justify-between bg-[var(--surface-container-low)]/40 p-6">
              <div className="flex gap-5 text-[10px] tracking-[0.18em] text-[var(--on-surface-variant)]">
                <button type="button">记忆</button>
                <button type="button">细化</button>
              </div>
              <SealButton onClick={() => navigate("/match-gallery/p-ruoyun")}>寻觅</SealButton>
            </div>
          </div>
          <div className="pointer-events-none absolute -right-5 bottom-7 hidden text-[120px] leading-none text-[var(--primary)]/10 xl:block">梅</div>
        </section>

        <section className="mt-20">
          <div className="mb-8 flex items-baseline justify-between">
            <h3 className="font-headline text-3xl italic">文库精选</h3>
            <div className="mx-5 h-px flex-1 bg-[var(--outline-variant)]/20" />
            <button className="text-[10px] tracking-[0.16em] text-[var(--primary)]" type="button">
              查看全部
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:gap-6">
            <article className="bg-[var(--surface-container-low)] p-8 md:col-span-7">
              <p className="text-[10px] tracking-[0.28em] text-[var(--primary)]">诗词文库</p>
              <h4 className="mt-4 font-headline text-4xl font-light">宋词的远方</h4>
              <p className="mt-3 max-w-sm text-sm text-[var(--on-surface-variant)]">在宋词的留白与回环里，寻找情感的慢速共鸣。</p>
            </article>
            <div className="grid gap-4 md:col-span-5 md:grid-rows-2">
              <article className="bg-[var(--surface-container)] p-6">
                <h4 className="font-headline text-2xl">竹林七贤</h4>
                <p className="mt-2 text-[10px] tracking-[0.2em] text-[var(--on-surface-variant)]">风骨与清谈</p>
              </article>
              <article className="bg-[var(--surface-container-low)] p-6">
                <h4 className="font-headline text-2xl">山水意境</h4>
                <p className="mt-2 text-[10px] tracking-[0.2em] text-[var(--on-surface-variant)]">云水之间</p>
              </article>
            </div>
          </div>
        </section>
      </main>
      <BottomNav />
    </div>
  );
}
