// 商户核销 tab（/admin/merchant）
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { trpcErrorMessage } from "@/lib/errors";
import { Card } from "./_shared";

export default function AdminMerchant() {
  const merchants = trpc.responses.merchantsList.useQuery(undefined, { refetchInterval: 30000 });
  const redemptions = trpc.responses.redemptionsList.useQuery(undefined, { refetchInterval: 30000 });
  const save = trpc.responses.merchantSave.useMutation();
  const remove = trpc.responses.merchantRemove.useMutation();
  const createRed = trpc.responses.redemptionCreate.useMutation();
  const confirmRed = trpc.responses.redemptionConfirm.useMutation();
  const settleRed = trpc.responses.redemptionSettle.useMutation();
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ name: "", address: "", rebate: "" });
  const [redForm, setRedForm] = useState({ matchId: "", merchantId: "", note: "" });
  const [err, setErr] = useState("");

  const run = async (p: Promise<unknown>) => {
    setErr("");
    try {
      await p;
      await Promise.all([utils.responses.merchantsList.invalidate(), utils.responses.redemptionsList.invalidate()]);
    } catch (e) { setErr(trpcErrorMessage(e)); }
  };

  const inputCls = "px-3 py-2 rounded-xl text-sm outline-none";
  const inputStyle = { background: "#F3ECD2", color: "#121212" };

  return (
    <>
      {err && <p className="text-sm mb-3 font-semibold" style={{ color: "#F97028" }}>{err}</p>}
      <Card title={`合作商户 · ${merchants.data?.length ?? 0}`}>
        <div className="flex flex-col gap-2 mb-3">
          {(merchants.data ?? []).map((m) => (
            <div key={m.id} className="rounded-2xl px-3 py-2.5 flex items-center justify-between gap-2" style={{ background: "#FBF3E3" }}>
              <p className="text-sm" style={{ color: "#121212" }}>
                <span className="font-display">{m.name}</span>
                <span className="text-xs" style={{ color: "#a3988a" }}> · {m.address ?? "无地址"} · 回扣 {(m.rebateCents / 100).toFixed(0)} 元/单 · {m.status === "active" ? "合作中" : "暂停"}</span>
              </p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => run(save.mutateAsync({ id: m.id, name: m.name, address: m.address ?? undefined, rebateCents: m.rebateCents, status: m.status === "active" ? "paused" : "active" }))}
                  className="text-xs px-3 py-1.5 rounded-full" style={{ background: "#FFFDF6", color: "#7a7060" }}
                >
                  {m.status === "active" ? "暂停" : "恢复"}
                </button>
                <button onClick={() => run(remove.mutateAsync({ id: m.id }))} className="text-xs px-3 py-1.5 rounded-full" style={{ background: "#FFFDF6", color: "#c0392b" }}>删除</button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <input className={inputCls} style={inputStyle} placeholder="商户名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={inputCls} style={inputStyle} placeholder="地址" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <input className={inputCls} style={{ ...inputStyle, width: 110 }} placeholder="回扣（元）" type="number" value={form.rebate} onChange={(e) => setForm({ ...form, rebate: e.target.value })} />
          <button
            onClick={() => {
              if (!form.name.trim()) return setErr("请填商户名");
              void run(save.mutateAsync({ name: form.name.trim(), address: form.address.trim() || undefined, rebateCents: Math.round(parseFloat(form.rebate || "0") * 100), status: "active" }));
              setForm({ name: "", address: "", rebate: "" });
            }}
            className="text-sm px-4 py-2 rounded-full" style={{ background: "#F97028", color: "#FFFDF6" }}
          >
            添加商户
          </button>
        </div>
      </Card>

      <Card title={`核销记录 · ${redemptions.data?.length ?? 0}`}>
        <div className="flex flex-col gap-2 mb-3">
          {(redemptions.data ?? []).map((r) => (
            <div key={r.id} className="rounded-2xl px-3 py-2.5 flex items-center justify-between gap-2" style={{ background: "#FBF3E3" }}>
              <p className="text-sm" style={{ color: "#121212" }}>
                <span className="font-display">配对#{r.matchId} · {r.merchantName}</span>
                <span className="text-xs" style={{ color: "#a3988a" }}> · {r.confirmedAt ? "已到店" : "未到店"} · {r.settleStatus === "settled" ? "已结算" : "待结算"}{r.note ? ` · ${r.note}` : ""}</span>
              </p>
              <div className="flex gap-1.5">
                {!r.confirmedAt && (
                  <button onClick={() => run(confirmRed.mutateAsync({ id: r.id }))} className="text-xs px-3 py-1.5 rounded-full" style={{ background: "#FFFDF6", color: "#7a7060" }}>确认到店</button>
                )}
                {r.settleStatus === "pending" && (
                  <button onClick={() => run(settleRed.mutateAsync({ id: r.id, status: "settled" }))} className="text-xs px-3 py-1.5 rounded-full" style={{ background: "#FFFDF6", color: "#3a7d5c" }}>结算</button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <input className={inputCls} style={{ ...inputStyle, width: 110 }} placeholder="配对 ID" type="number" value={redForm.matchId} onChange={(e) => setRedForm({ ...redForm, matchId: e.target.value })} />
          <select className={inputCls} style={inputStyle} value={redForm.merchantId} onChange={(e) => setRedForm({ ...redForm, merchantId: e.target.value })}>
            <option value="">选择商户</option>
            {(merchants.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input className={inputCls} style={inputStyle} placeholder="备注" value={redForm.note} onChange={(e) => setRedForm({ ...redForm, note: e.target.value })} />
          <button
            onClick={() => {
              const matchId = parseInt(redForm.matchId, 10);
              const merchantId = parseInt(redForm.merchantId, 10);
              if (!matchId || !merchantId) return setErr("请填配对 ID 并选择商户");
              void run(createRed.mutateAsync({ matchId, merchantId, note: redForm.note.trim() || undefined }));
              setRedForm({ matchId: "", merchantId: "", note: "" });
            }}
            className="text-sm px-4 py-2 rounded-full" style={{ background: "#F97028", color: "#FFFDF6" }}
          >
            登记核销
          </button>
        </div>
      </Card>
    </>
  );
}
