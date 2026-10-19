// 运营指标 tab（/admin/ops）
import { trpc } from "@/providers/trpc";
import { Card } from "./_shared";

export default function AdminOps() {
  const stats = trpc.responses.opsStats.useQuery(undefined, { refetchInterval: 30000 });
  const exportOps = trpc.responses.exportOps.useQuery(undefined, { enabled: false });

  const download = (kind: "matches" | "redemptions") => async () => {
    const res = await exportOps.refetch();
    if (!res.data) return;
    const rows = res.data[kind] as Record<string, unknown>[];
    if (rows.length === 0) return;
    const header = Object.keys(rows[0]);
    const lines = [header.join(",")];
    for (const row of rows) {
      lines.push(header.map((k) => `"${String(row[k] ?? "").replace(/"/g, '""')}"`).join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${kind}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (stats.isLoading) return <p className="text-center py-16 font-display" style={{ color: "#a3988a" }}>加载中…</p>;
  if (stats.error || !stats.data) return <p className="text-sm" style={{ color: "#a3988a" }}>暂无数据（需要数据库连接正常）。</p>;
  const d = stats.data;
  const fmt = (v: number | null, suffix = "") => (v === null ? "—" : `${v}${suffix}`);
  return (
    <>
      <p className="text-sm mb-4" style={{ color: "#7a7060" }}>本周 {d.weekKey} · 核心运营指标</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card title="本周配对"><p className="font-display text-3xl" style={{ color: "#F97028" }}>{d.weeklyPairs} 对</p>
          <p className="text-xs mt-1" style={{ color: "#a3988a" }}>待确认 {d.pendingSend} · 轮空 {d.cancelled}</p></Card>
        <Card title="确认率"><p className="font-display text-3xl" style={{ color: "#F97028" }}>{fmt(d.confirmRate, "%")}</p>
          <p className="text-xs mt-1" style={{ color: "#a3988a" }}>周五零点前确认见面</p></Card>
        <Card title="成行率"><p className="font-display text-3xl" style={{ color: "#F97028" }}>{fmt(d.meetRate, "%")}</p>
          <p className="text-xs mt-1" style={{ color: "#a3988a" }}>回访中实际见面占比</p></Card>
        <Card title="回访均分"><p className="font-display text-3xl" style={{ color: "#F97028" }}>{fmt(d.avgScore)}</p>
          <p className="text-xs mt-1" style={{ color: "#a3988a" }}>1–5 分</p></Card>
        <Card title="差评待复核"><p className="font-display text-3xl" style={{ color: "#F97028" }}>{d.poolReview} 人</p>
          <p className="text-xs mt-1" style={{ color: "#a3988a" }}>回访评分 ≤2 自动出池</p></Card>
      </div>
      <Card title="运营数据导出">
        <div className="flex gap-2 flex-wrap">
          <button onClick={download("matches")} className="font-display text-sm px-5 py-2.5 rounded-full" style={{ background: "#121212", color: "#F3ECD2" }}>
            导出 matches CSV ↓
          </button>
          <button onClick={download("redemptions")} className="font-display text-sm px-5 py-2.5 rounded-full" style={{ background: "#121212", color: "#F3ECD2" }}>
            导出 redemptions CSV ↓
          </button>
        </div>
      </Card>
    </>
  );
}
