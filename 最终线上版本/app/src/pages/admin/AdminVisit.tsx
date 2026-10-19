// 访问统计 tab（/admin/visits）
import { trpc } from "@/providers/trpc";
import { Card } from "./_shared";

export default function AdminVisit() {
  const stats = trpc.responses.visitStats.useQuery(undefined, { refetchInterval: 30000 });
  if (stats.isLoading) return <p className="text-center py-16 font-display" style={{ color: "#a3988a" }}>加载中…</p>;
  if (stats.error || !stats.data) {
    return <p className="text-sm" style={{ color: "#a3988a" }}>还没有访问数据，或数据库未连接。</p>;
  }
  const { today, total, days, sources } = stats.data;
  const max = Math.max(1, ...days.map((d) => d.count));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card title="今日访问">
          <p className="font-display text-3xl" style={{ color: "#F97028" }}>{today}</p>
          <p className="text-xs mt-1" style={{ color: "#a3988a" }}>同一浏览器当天只计 1 次</p>
        </Card>
        <Card title="累计访问">
          <p className="font-display text-3xl" style={{ color: "#121212" }}>{total}</p>
          <p className="text-xs mt-1" style={{ color: "#a3988a" }}>自统计功能上线起</p>
        </Card>
      </div>

      <Card title="最近 30 天">
        <div className="flex items-stretch gap-1 h-40">
          {days.map((d) => (
            <div key={d.day} className="flex-1 h-full flex flex-col min-w-0" title={`${d.day.slice(5)} · ${d.count} 次`}>
              <div style={{ flexGrow: Math.max(0, max - d.count) }} />
              <div
                className="w-full rounded-t-sm"
                style={{
                  flexGrow: d.count,
                  minHeight: d.count > 0 ? 4 : 0,
                  background: d.count > 0 ? "#F97028" : "transparent",
                }}
              />
            </div>
          ))}
        </div>
        <p className="text-xs mt-2" style={{ color: "#a3988a" }}>
          {days[0]?.day} — {days[days.length - 1]?.day}，柱高为当天访问次数
        </p>
      </Card>

      <Card title="来源">
        {sources.length === 0 && <p className="text-sm" style={{ color: "#a3988a" }}>还没有来源数据。</p>}
        <div className="flex flex-col gap-2">
          {sources.map((s) => (
            <div key={s.source} className="flex items-center justify-between text-sm" style={{ color: "#3d3830" }}>
              <span>{s.source}</span>
              <span className="font-display" style={{ color: "#F97028" }}>{s.count}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
