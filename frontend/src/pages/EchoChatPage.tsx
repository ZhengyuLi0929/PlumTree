import { TopBar } from "../components/ui/AppChrome";

const messages = [
  { role: "them", text: "我在阁下对山间云雾的描述中，感受到了某种共鸣。", time: "10:24" },
  { role: "them", text: "晨起初寒，折梅一枝。", time: "10:26", image: true },
  { role: "me", text: "常言道，梅即文人之骨。此枝韵味极佳。", time: "11:02" },
  { role: "them", text: "明日雨水，可愿一同听雨？", time: "11:15" },
];

export function EchoChatPage() {
  return (
    <div className="min-h-[100dvh] bg-[var(--surface)]">
      <TopBar title="若云" subtitle="在线 · 见信如晤" />
      <main className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col gap-7 px-5 pb-40 pt-28">
        <div className="flex justify-center">
          <span className="text-[10px] tracking-[0.22em] text-[var(--on-surface-variant)]/50">春分</span>
        </div>
        {messages.map((item, idx) => (
          <article
            key={idx}
            className={`max-w-[86%] ${
              item.role === "me" ? "ml-auto bg-[var(--primary)] text-white" : "bg-[var(--surface-container-low)] text-[var(--on-surface)]"
            } p-5`}
          >
            {item.image && <div className="mb-3 h-40 w-full bg-[var(--surface-container)]" />}
            <p className={`text-[15px] leading-relaxed ${item.role === "me" ? "opacity-95" : "text-[var(--on-surface-variant)]"}`}>{item.text}</p>
            <p className={`mt-3 text-[9px] tracking-[0.17em] ${item.role === "me" ? "opacity-70" : "text-[var(--on-surface-variant)]/60"}`}>{item.time}</p>
          </article>
        ))}
      </main>

      <section className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--outline-variant)]/30 bg-[var(--surface)]/92 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-end gap-3">
          <button className="material-symbols-outlined text-[var(--on-surface-variant)]/55" type="button">
            add_circle
          </button>
          <textarea
            className="max-h-28 min-h-[40px] flex-1 resize-none border-0 border-b border-[var(--outline-variant)] bg-transparent px-0 py-2 text-sm outline-none focus:border-[var(--primary)]"
            placeholder="落笔..."
            rows={1}
          />
          <button className="material-symbols-outlined text-[var(--primary)]" type="button">
            send
          </button>
        </div>
      </section>
    </div>
  );
}
