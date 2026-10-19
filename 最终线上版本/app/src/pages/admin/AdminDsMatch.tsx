// AI 匹配 tab（/admin/dsmatch）：机制说明 + 参数 + 提示词 + 结果与拖拽调整
import { useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import { trpcErrorMessage } from "@/lib/errors";
import { Card } from "./_shared";

type DsPair = { man: string; woman: string; manSat: number; womanSat: number; harmony: number; manReasons: string[]; womanReasons: string[]; matchId?: number };
type DragSrc = { matchId: number; side: "man" | "woman" } | null;
type DsResult = {
  ranAt: string;
  eligibleCount: number;
  globalSum: number;
  droppedDuplicates: { name: string; keptWechat: string; droppedWechat: string }[];
  skippedCount: { 异地: number; 同班: number };
  scoringFailures: string[];
  globalPairs: DsPair[];
  localMen: { person: string; best: string | null; harmony: number; manSat: number; womanSat: number; manReasons: string[]; womanReasons: string[] }[];
  localWomen: { person: string; best: string | null; harmony: number; manSat: number; womanSat: number; manReasons: string[]; womanReasons: string[] }[];
  unmatchedMen: string[];
  unmatchedWomen: string[];
};

export default function AdminDsMatch() {
  return <DsMatchPanel />;
}

function PairRow({ p, rank, dragSrc, onDragStart, onDrop }: {
  p: DsPair;
  rank?: number;
  dragSrc: DragSrc;
  onDragStart: (src: DragSrc) => void;
  onDrop: (target: { matchId: number; side: "man" | "woman" }) => void;
}) {
  const [open, setOpen] = useState(false);
  const hot = p.harmony >= 75;
  const chip = (side: "man" | "woman", name: string) => {
    const draggable = p.matchId != null;
    const isSrc = dragSrc?.matchId === p.matchId && dragSrc?.side === side;
    return (
      <span
        draggable={draggable}
        onDragStart={draggable ? () => onDragStart({ matchId: p.matchId!, side }) : undefined}
        onDragOver={draggable ? (e) => e.preventDefault() : undefined}
        onDrop={draggable ? (e) => { e.preventDefault(); onDrop({ matchId: p.matchId!, side }); } : undefined}
        className="inline-block px-2 py-0.5 rounded-lg"
        title={draggable ? "拖到另一对的人身上即可交换" : undefined}
        style={{
          cursor: draggable ? "grab" : "default",
          background: isSrc ? "#F97028" : "transparent",
          color: isSrc ? "#FFFDF6" : "inherit",
          outline: draggable ? "1px dashed #E8DCC0" : "none",
        }}
      >
        {name}
      </span>
    );
  };
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: hot ? "#FFF1E8" : "#FBF3E3" }}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left">
        <p className="text-sm font-semibold" style={{ color: "#121212" }}>
          {rank ? <span style={{ color: "#F97028" }}>{rank}. </span> : null}
          {chip("man", p.man)} <span style={{ color: "#a3988a" }}>×</span> {chip("woman", p.woman)}
        </p>
        <p className="text-xs shrink-0" style={{ color: "#a3988a" }}>
          男 <b style={{ color: "#F97028" }}>{p.manSat}</b> · 女 <b style={{ color: "#F97028" }}>{p.womanSat}</b> · 和谐 <b style={{ color: hot ? "#F97028" : "#3d3830" }}>{p.harmony}</b> {open ? "▲" : "▼"}
        </p>
      </button>
      {open && (
        <div className="px-4 pb-4 grid md:grid-cols-2 gap-3 text-xs leading-relaxed" style={{ color: "#5a5347" }}>
          <div className="rounded-xl p-3" style={{ background: "#FFFDF6" }}>
            <p className="font-display mb-1" style={{ color: "#F97028" }}>男方视角</p>
            {p.manReasons.map((r, i) => <p key={i} className="mb-1">{["初见", "一个月", "长期"][i]}：{r}</p>)}
          </div>
          <div className="rounded-xl p-3" style={{ background: "#FFFDF6" }}>
            <p className="font-display mb-1" style={{ color: "#F489A3" }}>女方视角</p>
            {p.womanReasons.map((r, i) => <p key={i} className="mb-1">{["初见", "一个月", "长期"][i]}：{r}</p>)}
          </div>
        </div>
      )}
    </div>
  );
}

function DsMatchPanel() {
  const promptQ = trpc.responses.dsGetPrompt.useQuery();
  const tunablesQ = trpc.responses.dsGetTunables.useQuery();
  const setTunables = trpc.responses.dsSetTunables.useMutation();
  const setPrompt = trpc.responses.dsSetPrompt.useMutation();
  const run = trpc.responses.dsRunMatch.useMutation();
  const status = trpc.responses.dsMatchStatus.useQuery(undefined, { refetchInterval: 4000 });
  const running = status.data?.state === "running";
  const result = trpc.responses.dsMatchResult.useQuery(undefined, { refetchInterval: running ? 8000 : false });
  const utils = trpc.useUtils();
  const [text, setText] = useState("");
  const [topK, setTopK] = useState(8);
  const [conc, setConc] = useState(5);
  const [saved, setSaved] = useState(false);
  const [tunSaved, setTunSaved] = useState(false);
  const [err, setErr] = useState("");
  const [dragSrc, setDragSrc] = useState<DragSrc>(null);
  const swap = trpc.responses.swapPairMembers.useMutation();

  useEffect(() => {
    if (promptQ.data && !text) setText(promptQ.data.prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptQ.data]);
  useEffect(() => {
    if (tunablesQ.data) { setTopK(tunablesQ.data.topK); setConc(tunablesQ.data.concurrency); }
  }, [tunablesQ.data]);
  // 任务跑完（done）时主动刷新结果，否则轮询一停就停在「还没有跑过匹配」
  useEffect(() => {
    if (status.data?.state === "done") void utils.responses.dsMatchResult.invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.data?.state]);

  const data = result.data as DsResult | null;
  const start = () => {
    setErr("");
    run.mutate(undefined, {
      onSuccess: () => { void utils.responses.dsMatchStatus.invalidate(); void utils.responses.dsMatchResult.invalidate(); },
      onError: (e) => setErr(trpcErrorMessage(e)),
    });
  };

  return (
    <>
      <Card title="匹配机制（v2 · 低成本）">
        <ol className="text-xs leading-relaxed pl-4 space-y-1" style={{ color: "#5a5347", listStyle: "decimal" }}>
          <li>读报名档案，同一人去重（留最新报名），过滤异地与同班。</li>
          <li>姓名脱敏成代号（M00/W00），AI 看不到真实姓名。</li>
          <li><b>规则预筛（零成本）</b>：用规则匹配（官配加分、兴趣互中、硬雷区）给每个人只留 <b>topK</b> 个候选，砍掉其余组合——这是省钱的关键。</li>
          <li><b>按对打分</b>：每个候选对一次调用，AI 同时扮演男方和女方各打三轮分（初见/一个月/长期）并写理由。JSON 小、几乎不失败。</li>
          <li>和谐分 = 双方均分的平均；匈牙利算法求全局最优（每人最多一对，总分最大）。</li>
          <li>失败的对不会拖垮全局，列在结果末尾「打分失败清单」。</li>
        </ol>
        <p className="text-xs mt-2" style={{ color: "#a3988a" }}>
          成本量级：topK=8 时约 200 次调用/轮，deepseek-flash 约几毛钱；topK 越大越贵（线性）。
        </p>
        <div className="flex items-end gap-3 mt-3 flex-wrap">
          <label className="text-xs" style={{ color: "#7a7060" }}>
            topK 候选/人
            <input type="number" min={1} max={30} value={topK} onChange={(e) => setTopK(parseInt(e.target.value || "8", 10))}
              className="block mt-1 w-24 px-3 py-2 rounded-xl text-sm outline-none" style={{ background: "#F3ECD2", color: "#121212" }} />
          </label>
          <label className="text-xs" style={{ color: "#7a7060" }}>
            并发数
            <input type="number" min={1} max={10} value={conc} onChange={(e) => setConc(parseInt(e.target.value || "5", 10))}
              className="block mt-1 w-24 px-3 py-2 rounded-xl text-sm outline-none" style={{ background: "#F3ECD2", color: "#121212" }} />
          </label>
          <button
            onClick={() => {
              setTunSaved(false);
              setTunables.mutate({ topK, concurrency: conc }, { onSuccess: () => setTunSaved(true), onError: (e) => setErr(trpcErrorMessage(e)) });
            }}
            disabled={setTunables.isPending}
            className="text-sm px-5 py-2.5 rounded-full disabled:opacity-50"
            style={{ background: "#F3ECD2", color: "#5a5347" }}
          >
            {setTunables.isPending ? "保存中…" : tunSaved ? "✓ 已保存" : "保存参数"}
          </button>
          <button
            onClick={start}
            disabled={running || run.isPending}
            className="font-display text-sm px-6 py-2.5 rounded-full disabled:opacity-50"
            style={{ background: "#121212", color: "#F3ECD2" }}
          >
            {running ? `匹配中… ${status.data?.done ?? 0}/${status.data?.total ?? "?"}` : "开始匹配"}
          </button>
        </div>
      </Card>

      <Card title="匹配提示词（改完记得保存）">
        <p className="text-xs mb-2" style={{ color: "#7a7060" }}>
          占位符：{"{man_id} / {man_card} / {woman_id} / {woman_card}"} 会被自动替换。{promptQ.data?.isDefault ? "当前是默认提示词。" : "当前是自定义提示词。"}
        </p>
        <textarea
          className="w-full rounded-xl p-3 text-xs leading-relaxed outline-none"
          style={{ background: "#F3ECD2", color: "#121212", minHeight: 220, resize: "vertical" }}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex gap-2 mt-3 flex-wrap">
          <button
            onClick={() => {
              setSaved(false);
              setPrompt.mutate({ prompt: text }, { onSuccess: () => setSaved(true), onError: (e) => setErr(trpcErrorMessage(e)) });
            }}
            disabled={setPrompt.isPending || !text}
            className="text-sm px-5 py-2.5 rounded-full disabled:opacity-50"
            style={{ background: "#F97028", color: "#FFFDF6" }}
          >
            {setPrompt.isPending ? "保存中…" : saved ? "✓ 已保存" : "保存提示词"}
          </button>
          <button
            onClick={() => { void promptQ.refetch().then((r) => { if (r.data) setText(r.data.prompt); }); }}
            className="text-sm px-5 py-2.5 rounded-full"
            style={{ background: "#F3ECD2", color: "#7a7060" }}
          >
            还原成线上保存的版本
          </button>
        </div>
        {err && <p className="text-sm mt-2" style={{ color: "#9a3412" }}>{err}</p>}
        {running && (
          <div className="mt-3 h-3 rounded-full overflow-hidden" style={{ background: "#E8DCC0" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${status.data?.total ? Math.round((status.data.done / status.data.total) * 100) : 0}%`, background: "linear-gradient(90deg, #F97028, #F489A3)" }}
            />
          </div>
        )}
        {status.data?.state === "error" && (
          <div className="mt-3 rounded-xl p-3" style={{ background: "#FDEAE0" }}>
            <p className="text-sm font-semibold" style={{ color: "#9a3412" }}>上次运行失败：{status.data.error}</p>
            {(status.data.errors ?? []).length > 0 && (
              <ul className="text-xs mt-1.5 space-y-1" style={{ color: "#9a3412" }}>
                {(status.data.errors ?? []).map((e, i) => (
                  <li key={i}>· {e}</li>
                ))}
              </ul>
            )}
            <p className="text-xs mt-2" style={{ color: "#a3988a" }}>常见原因：DeepSeek 限流（429）、模型返回非法 JSON、网络超时。已自动降并发并退避重试，仍失败请隔几分钟再点一次。</p>
          </div>
        )}
      </Card>

      {data ? (
        <>
          <p className="text-sm mb-4" style={{ color: "#7a7060" }}>
            上次运行：{new Date(data.ranAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} · 有效评分对 {data.eligibleCount} · 全局 {data.globalPairs.length} 对（和谐分和 {data.globalSum}） · 硬过滤：异地 {data.skippedCount.异地} / 同班 {data.skippedCount.同班}
          </p>
          {data.droppedDuplicates.length > 0 && (
            <Card title={`去重（丢掉较早的重复报名）· ${data.droppedDuplicates.length}`}>
              {data.droppedDuplicates.map((d, i) => (
                <p key={i} className="text-xs mb-1" style={{ color: "#7a7060" }}>{d.name}：保留 {d.keptWechat}，丢弃 {d.droppedWechat}</p>
              ))}
            </Card>
          )}
          <Card title={`全局最优配对 · ${data.globalPairs.length} 对`}>
            <p className="text-xs mb-3" style={{ color: "#a3988a" }}>要调整：按住一个人的名字拖到另一对的人身上即可交换（只对待发送的配对生效，「匹配结果」页签同步变化）。</p>
            <div className="flex flex-col gap-2">
              {data.globalPairs.map((p, i) => (
                <PairRow
                  key={p.matchId ?? i}
                  p={p}
                  rank={i + 1}
                  dragSrc={dragSrc}
                  onDragStart={setDragSrc}
                  onDrop={(target) => {
                    if (!dragSrc || (dragSrc.matchId === target.matchId && dragSrc.side === target.side)) return;
                    setErr("");
                    swap.mutate(
                      { idA: dragSrc.matchId, sideA: dragSrc.side, idB: target.matchId, sideB: target.side },
                      {
                        onSuccess: () => {
                          setDragSrc(null);
                          void utils.responses.dsMatchResult.invalidate();
                          void utils.responses.airdropQueue.invalidate();
                        },
                        onError: (e) => setErr(trpcErrorMessage(e)),
                      },
                    );
                  }}
                />
              ))}
            </div>
          </Card>
          <div className="grid md:grid-cols-2 gap-4">
            <Card title={`男生各自最想配 · ${data.localMen.length}`}>
              <div className="flex flex-col gap-2">
                {data.localMen.map((p, i) => (
                  <p key={i} className="text-sm" style={{ color: "#3d3830" }}>
                    {p.person} → {p.best ?? "（无同城不同班候选人）"}
                    {p.best ? <span className="text-xs" style={{ color: "#a3988a" }}> · {p.harmony}</span> : null}
                  </p>
                ))}
              </div>
            </Card>
            <Card title={`女生各自最想配 · ${data.localWomen.length}`}>
              <div className="flex flex-col gap-2">
                {data.localWomen.map((p, i) => (
                  <p key={i} className="text-sm" style={{ color: "#3d3830" }}>
                    {p.person} → {p.best ?? "（无同城不同班候选人）"}
                    {p.best ? <span className="text-xs" style={{ color: "#a3988a" }}> · {p.harmony}</span> : null}
                  </p>
                ))}
              </div>
            </Card>
          </div>
          {(data.unmatchedMen.length > 0 || data.unmatchedWomen.length > 0) && (
            <Card title="本轮未配上">
              <p className="text-sm mb-1" style={{ color: "#7a7060" }}>男生：{data.unmatchedMen.join("、") || "无"}</p>
              <p className="text-sm" style={{ color: "#7a7060" }}>女生：{data.unmatchedWomen.join("、") || "无"}</p>
            </Card>
          )}
          {data.scoringFailures.length > 0 && (
            <Card title={`打分失败清单 · ${data.scoringFailures.length}`}>
              <ul className="text-xs space-y-1" style={{ color: "#9a3412" }}>
                {data.scoringFailures.map((f, i) => <li key={i}>· {f}</li>)}
              </ul>
            </Card>
          )}
        </>
      ) : (
        <p className="text-sm" style={{ color: "#a3988a" }}>还没有跑过匹配。保存提示词后点「开始匹配」。</p>
      )}
    </>
  );
}
