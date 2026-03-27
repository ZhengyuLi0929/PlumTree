import { Link } from "react-router-dom";
import { BottomNav, TopBar } from "../components/ui/AppChrome";

const chats = [
  { id: "ruoyun", name: "若云", last: "明日雨水，可愿一同听雨？", time: "11:15" },
  { id: "linyu", name: "林语", last: "今日修复了一卷旧帖，想与你分享。", time: "昨天" },
  { id: "zeyuan", name: "泽远", last: "你写的那段自述很动人。", time: "周二" },
];

export function EchoesPage() {
  return (
    <div className="min-h-[100dvh] bg-[var(--surface)] pb-32">
      <TopBar title="回响" subtitle="与你同频的人" />
      <main className="mx-auto max-w-2xl px-5 pb-36 pt-28">
        <section className="space-y-4">
          {chats.map((chat) => (
            <Link
              className="block bg-[var(--surface-container-low)] px-4 py-4 transition hover:bg-[var(--surface-container-lowest)]"
              key={chat.id}
              to={`/echoes/chat/${chat.id}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-headline text-2xl">{chat.name}</p>
                  <p className="mt-2 text-sm text-[var(--on-surface-variant)]">{chat.last}</p>
                </div>
                <span className="text-[10px] text-[var(--on-surface-variant)]/70">{chat.time}</span>
              </div>
            </Link>
          ))}
        </section>

        <section className="mt-10 bg-[var(--surface-container)] p-5">
          <h3 className="font-headline text-2xl">书信偏好</h3>
          <p className="mt-3 text-sm text-[var(--on-surface-variant)]">你偏好慢速、长文本、可停顿的表达。系统会优先推荐同类型交流对象。</p>
        </section>
      </main>
      <BottomNav />
    </div>
  );
}
