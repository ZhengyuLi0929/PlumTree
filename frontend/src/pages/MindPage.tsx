import { BottomNav, TopBar } from "../components/ui/AppChrome";
import { useLanguage } from "../app/language";

const blocks = [
  {
    role: "user" as const,
    zh: "在这纷扰世间，如何捕捉那一抹寂静的真意？",
    en: "How does one capture the essence of silence in a world of constant motion?",
  },
  {
    role: "ai" as const,
    zh: "静非无声，乃心之澄澈。如西湖之烟雨，非为遮掩，实乃以虚而见其深。",
    en: "Silence is not the absence of sound, but the presence of clarity.",
  },
  {
    role: "user" as const,
    zh: "那便谈谈“水墨仪式”吧。笔触之下，如何化为一种冥想？",
    en: "Then let us speak of the ink ritual. How can a brush stroke become meditation?",
  },
];

export function MindPage() {
  const { tx } = useLanguage();

  return (
    <div className="min-h-[100dvh] overflow-hidden bg-[var(--surface)]">
      <TopBar title={tx("寻梅", "Seeking Plum")} subtitle={tx("心念", "Mind's Echo")} />

      <main className="mx-auto h-[100dvh] max-w-3xl overflow-y-auto px-5 pb-44 pt-28">
        <div className="space-y-10">
          {blocks.map((block, idx) => (
            <section className={`flex flex-col ${block.role === "user" ? "items-end" : "items-start"}`} key={idx}>
              <div className="mb-3 text-[10px] tracking-[0.2em] text-[var(--primary)]/70">
                {block.role === "user" ? tx("落笔", "The Scribe") : tx("心念", "Mind's Echo")}
              </div>
              <div
                className={`max-w-[90%] border-b border-[var(--primary)]/12 p-6 ${
                  block.role === "user" ? "bg-[var(--surface-container-lowest)]" : "bg-[var(--surface-container-low)]"
                }`}
              >
                <p className="font-headline text-2xl italic leading-relaxed">{tx(block.zh, block.en)}</p>
              </div>
            </section>
          ))}

          <section className="space-y-6 pb-8">
            <div className="flex items-center gap-2 text-[10px] tracking-[0.2em] text-[var(--primary)]">
              <span className="h-2 w-2 bg-[var(--primary)]" />
              {tx("心念", "Mind's Echo")}
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_1.2fr]">
              <div className="aspect-[3/4] bg-[var(--surface-container)]" />
              <div className="space-y-4">
                <p className="font-headline text-3xl italic">
                  {tx("“笔不领手，气领笔。”", '"The brush does not lead the hand; the breath leads the brush."')}
                </p>
                <p className="text-sm text-[var(--on-surface-variant)]">
                  {tx(
                    "冥想始于砚台与第一滴水相遇之时。墨与水在宣纸上的游走，便是内在节奏的具象。",
                    "Meditation begins when inkstone meets the first drop of water.",
                  )}
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>

      <section className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-[var(--surface)] via-[var(--surface)] to-transparent px-5 pb-[calc(3.2rem+env(safe-area-inset-bottom))] pt-6">
        <div className="mx-auto flex max-w-3xl items-center gap-3 border-b border-[var(--primary)]/20 bg-[var(--surface-container-lowest)] px-2 py-3">
          <span className="material-symbols-outlined text-[var(--primary)]/45">edit_note</span>
          <input
            className="w-full border-0 bg-transparent font-headline text-xl italic outline-none placeholder:text-[var(--on-surface)]/30"
            placeholder={tx("落笔...", "Inscribe your thought...")}
          />
          <button className="bg-[var(--primary)] px-4 py-2 text-[10px] tracking-[0.2em] text-white" type="button">
            {tx("散", "Emit")}
          </button>
        </div>
      </section>

      <BottomNav />
    </div>
  );
}
