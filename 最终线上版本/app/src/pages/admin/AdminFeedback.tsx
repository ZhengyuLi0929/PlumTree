// 改进意见 tab（/admin/feedback）：回访自由文本 + 拒绝见面原因
import { trpc } from "@/providers/trpc";
import { Card } from "./_shared";

export default function AdminFeedback() {
  const q = trpc.responses.feedbackNotes.useQuery(undefined, { refetchInterval: 30000 });
  if (q.isLoading) return <p className="text-center py-16 font-display" style={{ color: "#a3988a" }}>加载中…</p>;
  const rows = q.data ?? [];
  return (
    <Card title={`改进意见 · ${rows.length} 条`}>
      {rows.length === 0 && <p className="text-sm" style={{ color: "#a3988a" }}>还没有用户提交改进意见。用户在回访或拒绝见面时写的话会出现在这里。</p>}
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-2xl p-4" style={{ background: "#FBF3E3" }}>
            <p className="text-xs mb-1" style={{ color: "#a3988a" }}>
              <span className="font-semibold" style={{ color: "#F97028" }}>{r.from}</span>
              {" · "}{r.pair} · {r.weekKey}{r.score ? ` · ${r.score} 星` : ""} · {new Date(r.updatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "#3d3830" }}>{r.note}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
