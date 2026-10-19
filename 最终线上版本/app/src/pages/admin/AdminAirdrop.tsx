// 匹配结果 tab（/admin/airdrop）：本周配对队列 + 推荐语 + 确认发送 + 手动配对列表
import { useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import { trpcErrorMessage } from "@/lib/errors";
import { Card } from "./_shared";

const MATCH_STATE_LABEL: Record<string, string> = {
  pending_send: "待确认", sent: "已发送", chatting: "传话中", confirmed: "已确认",
  declined: "谢绝", dating: "约会中", done: "已完成", cancelled: "已轮空",
};

export default function AdminAirdrop() {
  return <AirdropPanel />;
}

function AirdropPanel() {
  const q = trpc.responses.airdropQueue.useQuery(undefined, { refetchInterval: 20000 });
  const confirmAll = trpc.responses.confirmAllAirdrops.useMutation();
  const utils = trpc.useUtils();
  const [err, setErr] = useState("");
  const [previewFor, setPreviewFor] = useState<number | null>(null);
  const [blessingFor, setBlessingFor] = useState<{ id: number; man: string; woman: string } | null>(null);

  const run = async (p: Promise<unknown>) => {
    setErr("");
    try { await p; await utils.responses.airdropQueue.invalidate(); } catch (e) { setErr(trpcErrorMessage(e)); }
  };

  if (q.isLoading) return <p className="text-center py-16 font-display" style={{ color: "#a3988a" }}>加载中…</p>;
  if (q.error || !q.data) return <p className="text-sm" style={{ color: "#a3988a" }}>暂无数据（需要数据库连接正常）。</p>;
  const items = q.data.items;
  const pending = items.filter((i) => i.state === "pending_send");

  return (
    <>
      <p className="text-sm mb-4" style={{ color: "#7a7060" }}>
        本周 {q.data.weekKey} · 共 {items.length} 对 · 待确认 {pending.length} 对。
        确认前先预览短信内容；短信服务未配置时只会展示、不会真的发出。
      </p>
      {err && <p className="text-sm mb-3 font-semibold" style={{ color: "#F97028" }}>{err}</p>}
      {pending.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => run(confirmAll.mutateAsync(undefined))}
            disabled={confirmAll.isPending}
            className="font-display text-sm px-5 py-2.5 rounded-full disabled:opacity-50"
            style={{ background: "#F97028", color: "#FFFDF6" }}
          >
            {confirmAll.isPending ? "发送中…" : `一键确认发送全部 ${pending.length} 对`}
          </button>
        </div>
      )}
      <Card title={`本周配对 · ${items.length}`}>
        {items.length === 0 && <p className="text-sm" style={{ color: "#a3988a" }}>本周还没有配对（在「AI匹配」里跑一轮，或周三 20:00 调度器自动生成）。</p>}
        <div className="flex flex-col gap-2">
          {items.map((i) => (
            <div key={i.id} className="rounded-2xl p-3 flex items-center justify-between gap-3 flex-wrap" style={{ background: "#FBF3E3" }}>
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: "#121212" }}>
                  {i.man} × {i.woman}
                  <span className="ml-2 text-xs font-normal" style={{ color: "#a3988a" }}>{MATCH_STATE_LABEL[i.state] ?? i.state}</span>
                </p>
                <p className="text-xs truncate" style={{ color: "#a3988a" }}>
                  {i.reason ?? ""}
                  {!i.manBound || !i.womanBound ? ` · ${[!i.manBound && `${i.man}未绑定`, !i.womanBound && `${i.woman}未绑定`].filter(Boolean).join("、")}` : ""}
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => setBlessingFor(i)}
                  className="text-xs px-3 py-2 rounded-full"
                  style={{ background: "#FFFDF6", color: "#7a7060", border: "2px solid #E8DCC0" }}
                >
                  推荐语
                </button>
                {i.state === "pending_send" && (
                  <button
                    onClick={() => setPreviewFor(i.id)}
                    className="text-xs px-4 py-2 rounded-full"
                    style={{ background: "#F97028", color: "#FFFDF6" }}
                  >
                    确认发送
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <ManualPairsCard />
      {previewFor != null && (
        <AirdropPreviewDialog
          item={items.find((x) => x.id === previewFor)!}
          onClose={(sent) => {
            setPreviewFor(null);
            if (sent) void utils.responses.airdropQueue.invalidate();
          }}
        />
      )}
      {blessingFor && (
        <BlessingDialog
          matchId={blessingFor.id}
          man={blessingFor.man}
          woman={blessingFor.woman}
          onClose={() => setBlessingFor(null)}
        />
      )}
    </>
  );
}

/** 月老推荐语弹窗：AI 生成/重新生成，给男方和女方各一段 */
function BlessingDialog({ matchId, man, woman, onClose }: { matchId: number; man: string; woman: string; onClose: () => void }) {
  const gen = trpc.responses.pairBlessing.useMutation();
  const [texts, setTexts] = useState<{ forMan: string; forWoman: string } | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");

  const generate = (regenerate: boolean) => {
    setErr("");
    gen.mutate({ matchId, regenerate }, {
      onSuccess: (r) => setTexts({ forMan: r.forMan, forWoman: r.forWoman }),
      onError: (e) => setErr(trpcErrorMessage(e, "生成失败")),
    });
  };
  // 打开时先取缓存（有就直接展示，不重复花 token）
  useEffect(() => { generate(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(""), 1500);
    } catch { /* 剪贴板不可用时静默 */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(18,18,18,0.45)" }} onClick={onClose}>
      <div className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-3xl p-6" style={{ background: "#FFFDF6" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-3">
          <h2 className="font-display text-xl" style={{ color: "#121212" }}>{man} × {woman} · 月老推荐语</h2>
          <button onClick={onClose} className="text-sm px-3 py-1 rounded-full" style={{ background: "#FBF3E3", color: "#7a7060" }}>关闭</button>
        </div>
        {gen.isPending && !texts && <p className="text-sm" style={{ color: "#a3988a" }}>月老斟酌措辞中…</p>}
        {err && <p className="text-sm mb-2" style={{ color: "#9a3412" }}>{err}</p>}
        {texts && (
          <div className="flex flex-col gap-3">
            {([["发给 " + man, texts.forMan, "man"], ["发给 " + woman, texts.forWoman, "woman"]] as const).map(([label, text, key]) => (
              <div key={key} className="rounded-xl p-4" style={{ background: key === "man" ? "#FFF1E8" : "#FBEDF1" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold" style={{ color: "#F97028" }}>{label}</p>
                  <button onClick={() => copy(key, text)} className="text-xs px-2.5 py-1 rounded-full" style={{ background: "#FFFDF6", color: "#7a7060" }}>
                    {copied === key ? "✓ 已复制" : "复制"}
                  </button>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: "#3d3830" }}>{text}</p>
              </div>
            ))}
            <button
              onClick={() => generate(true)}
              disabled={gen.isPending}
              className="text-sm px-4 py-2.5 rounded-full disabled:opacity-50"
              style={{ background: "#F3ECD2", color: "#7a7060" }}
            >
              {gen.isPending ? "生成中…" : "重新生成（再花一次 AI）"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** 确认发送前的预览弹窗：展示将发出的短信内容；短信未配置时明确提示，不会假装发送 */
function AirdropPreviewDialog({ item, onClose }: {
  item: { id: number; man: string; woman: string };
  onClose: (sent: boolean) => void;
}) {
  const preview = trpc.responses.airdropPreview.useQuery({ id: item.id });
  const confirm = trpc.responses.confirmAirdrop.useMutation();
  const [sendResult, setSendResult] = useState<string[] | null>(null);
  const [err, setErr] = useState("");
  const data = preview.data;

  const doSend = () => {
    setErr("");
    confirm.mutate({ id: item.id }, {
      onSuccess: (r) => setSendResult(r.details ?? [`已发送 ${r.sent}/${r.total}`]),
      onError: (e) => setErr(trpcErrorMessage(e)),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(18,18,18,0.45)" }} onClick={() => onClose(Boolean(sendResult))}>
      <div className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-3xl p-6" style={{ background: "#FFFDF6" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-3">
          <h2 className="font-display text-xl" style={{ color: "#121212" }}>{item.man} × {item.woman} · 发送预览</h2>
          <button onClick={() => onClose(Boolean(sendResult))} className="text-sm px-3 py-1 rounded-full" style={{ background: "#FBF3E3", color: "#7a7060" }}>关闭</button>
        </div>
        {preview.isLoading && <p className="text-sm" style={{ color: "#a3988a" }}>加载中…</p>}
        {data && !data.smsConfigured && !sendResult && (
          <div className="rounded-xl p-3 mb-3" style={{ background: "#FDEAE0" }}>
            <p className="text-sm font-semibold" style={{ color: "#9a3412" }}>短信服务还没有配置好，现在点发送也发不出去。</p>
            <p className="text-xs mt-1" style={{ color: "#7a7060" }}>下面是配好之后会发给双方的短信内容（仅预览，不会真的发送）。</p>
          </div>
        )}
        {data && (
          <div className="flex flex-col gap-2 mb-4">
            {data.texts.map((t, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background: "#FBF3E3" }}>
                <p className="text-xs font-semibold mb-1" style={{ color: "#F97028" }}>发给 {t.name}（{t.phone}）</p>
                <p className="text-sm leading-relaxed" style={{ color: "#3d3830" }}>{t.text}</p>
              </div>
            ))}
          </div>
        )}
        {err && <p className="text-sm mb-2" style={{ color: "#9a3412" }}>{err}</p>}
        {sendResult ? (
          <div className="rounded-xl p-3 mb-3" style={{ background: "#EAF5EE" }}>
            {sendResult.map((d, i) => <p key={i} className="text-sm" style={{ color: "#3d3830" }}>{d}</p>)}
          </div>
        ) : (
          data?.smsConfigured && (
            <button
              onClick={doSend}
              disabled={confirm.isPending}
              className="w-full font-display text-base py-3 rounded-full disabled:opacity-50"
              style={{ background: "#F97028", color: "#FFFDF6" }}
            >
              {confirm.isPending ? "发送中…" : "确认发送这两条短信"}
            </button>
          )
        )}
      </div>
    </div>
  );
}

/** 手动配对（「手动匹配」页签里配的对，存在 match_pairs 表） */
function ManualPairsCard() {
  const roster = trpc.responses.roster.useQuery(undefined, { refetchInterval: 30000 });
  const removePair = trpc.responses.removePair.useMutation();
  const utils = trpc.useUtils();
  if (!roster.data) return null;
  const pairs = roster.data.pairs;
  if (pairs.length === 0) return null;
  const nameOf = new Map(roster.data.users.map((u) => [u.sessionId, u.name]));
  return (
    <Card title={`手动配对 · ${pairs.length} 对`}>
      <div className="flex flex-col gap-2">
        {pairs.map((p) => (
          <div key={p.id} className="rounded-2xl p-3 flex items-center justify-between gap-3" style={{ background: "#FBF3E3" }}>
            <p className="text-sm" style={{ color: "#121212" }}>
              {nameOf.get(p.leftSession) ?? p.leftSession.slice(0, 8)} × {nameOf.get(p.rightSession) ?? p.rightSession.slice(0, 8)}
              {p.note ? <span className="text-xs" style={{ color: "#a3988a" }}> · {p.note}</span> : null}
            </p>
            <button
              onClick={() => void removePair.mutateAsync({ id: Number(p.id) }).then(() => utils.responses.roster.invalidate())}
              className="text-xs px-3 py-2 rounded-full shrink-0"
              style={{ background: "#FFFDF6", color: "#7a7060" }}
            >
              解除
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
