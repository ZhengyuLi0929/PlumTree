import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { trpc } from "@/providers/trpc";
import { trpcErrorMessage } from "@/lib/errors";
import { TYPES, getMeme } from "@/data/types";
import { DIM_META, LOVE_LANGUAGES, type LangKey } from "@/data/questions";
import { computeScoresFinal } from "@/data/questions-final";
import { cardHtml, downloadCardHtml, downloadCardImage, measurePhotos, MATCH_CARD_CSS, type CardPerson } from "@/lib/matchCard";

type User = {
  sessionId: string;
  name: string;
  wechat: string;
  phone: string;
  gender: string;
  birthYear: number | null;
  city: string | null;
  gradClass: string | null;
  mbti: string | null;
  height: number | null;
  job: string | null;
  prefMinHeight: number | null;
  prefBirthFrom: number | null;
  prefBirthTo: number | null;
  acceptDistance: string | null;
  intro: string | null;
  expectation: string | null;
  value: string | null;
  typeCode: string | null;
  participate: boolean;
  answers: Record<string, number>;
  rankings: Record<string, string[]>;
  timings: Record<string, number>;
};

function asNumberRecord(raw: Record<string, number>) {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(raw ?? {})) out[Number(k)] = v;
  return out;
}

function quizView(u: User) {
  const answers = asNumberRecord(u.answers ?? {});
  const rankings = (u.rankings ?? {}) as Record<string, LangKey[]>;
  const timings = asNumberRecord(u.timings ?? {});
  const hasQuiz = Object.keys(answers).length > 0;
  if (!hasQuiz) {
    return {
      hasQuiz: false,
      typeCode: u.typeCode,
      meme: "",
      alias: "",
      langName: "",
      dims: [] as { title: string; leftName: string; rightName: string; left: number; right: number }[],
    };
  }
  const scores = computeScoresFinal(answers, rankings, timings);
  const pct = (a: number, b: number) => Math.round((a / ((a + b) || 1)) * 100);
  const dims = DIM_META.map((d) => {
    const pair = scores[d.key] as Record<string, number>;
    const left = pct(pair[d.left], pair[d.right]);
    return { title: d.title, leftName: d.leftName, rightName: d.rightName, left, right: 100 - left };
  });
  const topLang = (Object.entries(scores.LL) as [LangKey, number][]).sort((a, b) => b[1] - a[1])[0]?.[0];
  const type = u.typeCode && TYPES[u.typeCode] ? TYPES[u.typeCode] : null;
  return {
    hasQuiz: true,
    typeCode: u.typeCode,
    meme: type ? getMeme(type, u.gender) : "",
    alias: type?.alias ?? "",
    langName: topLang ? LOVE_LANGUAGES[topLang].name : "",
    dims,
  };
}

export default function Admin() {
  const me = trpc.responses.adminMe.useQuery();
  if (me.isLoading) {
    return <Shell><p className="text-center py-20 font-display" style={{ color: "#a3988a" }}>加载中…</p></Shell>;
  }
  if (me.error) return <AdminLogin onOk={() => void me.refetch()} />;
  return <AdminDesk onLogout={() => void me.refetch()} />;
}

function AdminLogin({ onOk }: { onOk: () => void }) {
  const login = trpc.responses.adminLogin.useMutation();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    login.mutate(
      { password },
      {
        onSuccess: (res) => {
          sessionStorage.setItem("adminToken", res.token);
          onOk();
        },
        onError: (e) => setErr(trpcErrorMessage(e, "登录失败")),
      },
    );
  };

  return (
    <Shell>
      <div className="max-w-md mx-auto rounded-3xl p-6 md:p-8" style={{ background: "#FFFDF6", boxShadow: "0 6px 24px rgba(18,18,18,0.06)" }}>
        <h1 className="font-display text-2xl mb-2" style={{ color: "#121212" }}>管理员登录</h1>
        <p className="text-sm mb-5" style={{ color: "#7a7060" }}>
          输入后台密码后，可查看报名资料、测评结果，并手动配对。
        </p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="管理员密码"
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={{ background: "#F3ECD2", color: "#121212" }}
            autoFocus
          />
          {err && <p className="text-sm font-semibold" style={{ color: "#F97028" }}>{err}</p>}
          <button
            type="submit"
            disabled={login.isPending || !password}
            className="font-display text-lg py-3.5 rounded-full disabled:opacity-50"
            style={{ background: "#F97028", color: "#FFFDF6" }}
          >
            {login.isPending ? "验证中…" : "进入后台"}
          </button>
        </form>
      </div>
    </Shell>
  );
}

function AdminDesk({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<"match" | "dsmatch" | "airdrop" | "pool" | "merchant" | "ops" | "visits">("match");
  const logout = trpc.responses.adminLogout.useMutation();

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="font-display text-2xl md:text-3xl" style={{ color: "#121212" }}>匹配后台</h1>
        <div className="flex items-center gap-2">
          <a href="/stats-v3" className="font-display text-sm px-4 py-2 rounded-full" style={{ background: "#F3ECD2", color: "#7a7060" }}>
            题库统计
          </a>
          <button
            onClick={() => logout.mutate(undefined, { onSuccess: () => { sessionStorage.removeItem("adminToken"); onLogout(); } })}
            className="font-display text-sm px-4 py-2 rounded-full"
            style={{ background: "#FFFDF6", color: "#7a7060" }}
          >
            退出
          </button>
        </div>
      </div>
      <div className="flex gap-2 mb-6 flex-wrap">
        <TabBtn active={tab === "match"} onClick={() => setTab("match")}>手动匹配</TabBtn>
        <TabBtn active={tab === "dsmatch"} onClick={() => setTab("dsmatch")}>AI匹配</TabBtn>
        <TabBtn active={tab === "airdrop"} onClick={() => setTab("airdrop")}>匹配结果</TabBtn>
        <TabBtn active={tab === "merchant"} onClick={() => setTab("merchant")}>商户核销</TabBtn>
        <TabBtn active={tab === "ops"} onClick={() => setTab("ops")}>运营指标</TabBtn>
        <TabBtn active={tab === "visits"} onClick={() => setTab("visits")}>访问统计</TabBtn>
      </div>
      {tab === "match" ? <MatchPanel /> : tab === "dsmatch" ? <DsMatchPanel /> : tab === "airdrop" ? <AirdropPanel /> : tab === "merchant" ? <MerchantPanel /> : tab === "ops" ? <OpsPanel /> : <VisitPanel />}
    </Shell>
  );
}

/* ================= DeepSeek 匹配 ================= */
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

const MATCH_STATE_LABEL: Record<string, string> = {
  pending_send: "待确认", sent: "已发送", chatting: "传话中", confirmed: "已确认",
  declined: "谢绝", dating: "约会中", done: "已完成", cancelled: "已轮空",
};

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

/** 资料卡片弹窗：v1 名片样式（含理想型/最看重/丘比特小猫），可下载 PNG/JPEG/HTML */
function MatchCardDialog({ person, onClose }: { person: CardPerson; onClose: () => void }) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const [ratios, setRatios] = useState<number[]>([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const hostRef = useRef<HTMLDivElement>(null);

  // 注入名片样式（一次）
  useEffect(() => {
    if (!document.getElementById("mc-style")) {
      const el = document.createElement("style");
      el.id = "mc-style";
      el.textContent = MATCH_CARD_CSS;
      document.head.appendChild(el);
    }
  }, []);

  // 人变了：重置到第一张照片并量长宽比
  useEffect(() => {
    setPhotoIdx(0);
    setRatios([]);
    let cancelled = false;
    void measurePhotos(person).then((r) => { if (!cancelled) setRatios(r); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person.name]);

  // 渲染名片（同一套模板，导出也是它）
  useEffect(() => {
    if (hostRef.current) {
      hostRef.current.innerHTML = cardHtml(person, { photoIdx, ratios });
      // 缩放预览：外层高度按卡片实际高度 * 缩放比收拢
      const card = hostRef.current.firstElementChild as HTMLElement | null;
      const box = hostRef.current.parentElement?.parentElement;
      if (card && box) {
        requestAnimationFrame(() => {
          box.style.height = `${Math.ceil(card.offsetHeight * 0.46) + 2}px`;
        });
      }
    }
  }, [person, photoIdx, ratios]);

  // 翻页（事件委托）
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const total = person.photos.length;
      if (total <= 1) return;
      if (t.closest("[data-mc-prev]")) setPhotoIdx((i) => (i - 1 + total) % total);
      if (t.closest("[data-mc-next]")) setPhotoIdx((i) => (i + 1) % total);
    };
    host.addEventListener("click", onClick);
    return () => host.removeEventListener("click", onClick);
  }, [person]);

  const dl = async (kind: "png" | "jpeg" | "html") => {
    setErr("");
    setBusy(kind);
    try {
      if (kind === "html") await downloadCardHtml(person);
      else await downloadCardImage(person, kind, photoIdx);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "下载失败");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(18,18,18,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-3xl p-6" style={{ background: "#FFFDF6" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <h2 className="font-display text-xl" style={{ color: "#121212" }}>{person.name} · 资料卡片</h2>
          <button onClick={onClose} className="text-sm px-3 py-1 rounded-full" style={{ background: "#FBF3E3", color: "#7a7060" }}>关闭</button>
        </div>
        {/* 名片自然宽度 1150px，缩小预览；导出时按原尺寸离屏渲染 */}
        <div className="mb-4 overflow-hidden rounded-2xl" style={{ border: "1px solid #F3ECD2", background: "#fff9f0" }}>
          <div style={{ width: 1150, transform: "scale(0.46)", transformOrigin: "top left" }}>
            <div ref={hostRef} />
          </div>
        </div>
        {person.photos.length > 1 && (
          <p className="text-xs mb-3" style={{ color: "#a3988a" }}>卡片左侧可翻页，导出的是当前展示的这一张。</p>
        )}
        {err && <p className="text-sm mb-2" style={{ color: "#9a3412" }}>{err}</p>}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => void dl("png")}
            disabled={busy !== ""}
            className="font-display text-sm px-6 py-2.5 rounded-full disabled:opacity-50"
            style={{ background: "#F97028", color: "#FFFDF6" }}
          >
            {busy === "png" ? "导出中…" : "一键下载 PNG ↓"}
          </button>
          <button onClick={() => void dl("jpeg")} disabled={busy !== ""} className="text-sm px-4 py-2.5 rounded-full disabled:opacity-50" style={{ background: "#F3ECD2", color: "#5a5347" }}>
            {busy === "jpeg" ? "导出中…" : "JPEG"}
          </button>
          <button onClick={() => void dl("html")} disabled={busy !== ""} className="text-sm px-4 py-2.5 rounded-full disabled:opacity-50" style={{ background: "#F3ECD2", color: "#5a5347" }}>
            {busy === "html" ? "导出中…" : "HTML（可另存 PDF）"}
          </button>
        </div>
      </div>
    </div>
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

function MerchantPanel() {
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

function OpsPanel() {
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

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="font-display text-sm px-5 py-2.5 rounded-full"
      style={{ background: active ? "#F97028" : "#FFFDF6", color: active ? "#FFFDF6" : "#7a7060" }}
    >
      {children}
    </button>
  );
}

function MatchPanel() {
  const roster = trpc.responses.roster.useQuery(undefined, { refetchInterval: 20000 });
  const savePair = trpc.responses.savePair.useMutation();
  const removePair = trpc.responses.removePair.useMutation();
  const utils = trpc.useUtils();
  const [pick, setPick] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  const data = roster.data;
  const byId = useMemo(() => new Map((data?.users ?? []).map((u) => [u.sessionId, u])), [data]);
  const pairedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of data?.pairs ?? []) {
      ids.add(p.leftSession);
      ids.add(p.rightSession);
    }
    return ids;
  }, [data]);

  const keyword = q.trim().toLowerCase();
  const matchKeyword = (u: User) => {
    if (!keyword) return true;
    return [u.name, u.wechat, u.city, u.gradClass, u.typeCode, u.gender].some((x) => String(x ?? "").toLowerCase().includes(keyword));
  };

  const singles = (data?.users ?? []).filter((u) => !pairedIds.has(u.sessionId) && matchKeyword(u));
  const inMales = singles.filter((u) => u.participate && u.gender === "男");
  const inFemales = singles.filter((u) => u.participate && u.gender === "女");
  const outMales = singles.filter((u) => !u.participate && u.gender === "男");
  const outFemales = singles.filter((u) => !u.participate && u.gender === "女");

  const refresh = async (p: Promise<unknown>) => {
    setErr("");
    try {
      await p;
      setPick([]);
      await utils.responses.roster.invalidate();
    } catch (e) {
      setErr(trpcErrorMessage(e));
    }
  };

  const toggle = (id: string) => {
    setPick((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const pairSelected = () => {
    if (pick.length !== 2) return;
    void refresh(savePair.mutateAsync({ leftSession: pick[0], rightSession: pick[1] }));
  };

  if (roster.isLoading) {
    return <p className="text-center py-20 font-display" style={{ color: "#a3988a" }}>加载中…</p>;
  }
  if (roster.error || !data) {
    return <p className="text-center py-20 text-sm" style={{ color: "#a3988a" }}>暂无数据（需要数据库连接正常）</p>;
  }

  const openUser = openId ? byId.get(openId) : null;

  return (
    <>
      <p className="text-sm mb-4" style={{ color: "#7a7060" }}>
        本周 {data.weekKey} · 已报名 {data.users.length} 人 · 已配 {data.pairs.length} 对 · 未配 {data.users.length - pairedIds.size} 人
        <br />点两个人，再按「配成一对」。点「资料」看完整测评和报名信息。
      </p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="搜索姓名 / 微信 / 城市 / 人格"
        className="w-full mb-4 px-4 py-3 rounded-xl text-sm outline-none"
        style={{ background: "#FFFDF6", color: "#121212" }}
      />
      {err && <p className="text-sm mb-3 font-semibold" style={{ color: "#F97028" }}>{err}</p>}

      {pick.length > 0 && (
        <div className="rounded-3xl p-4 mb-4 flex items-center justify-between gap-3 flex-wrap" style={{ background: "#FFF1E8" }}>
          <p className="text-sm" style={{ color: "#3d3830" }}>
            已选 {pick.map((id) => byId.get(id)?.name ?? id.slice(0, 6)).join(" × ")}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setPick([])} className="text-sm px-4 py-2 rounded-full" style={{ background: "#FFFDF6", color: "#7a7060" }}>取消</button>
            <button
              onClick={pairSelected}
              disabled={pick.length !== 2 || savePair.isPending}
              className="text-sm px-4 py-2 rounded-full disabled:opacity-50"
              style={{ background: "#F97028", color: "#FFFDF6" }}
            >
              配成一对
            </button>
          </div>
        </div>
      )}

      <Card title={`本周配对 · ${data.pairs.length} 对`}>
        {data.pairs.length === 0 && <p className="text-sm" style={{ color: "#a3988a" }}>还没有配对。</p>}
        <div className="flex flex-col gap-2">
          {data.pairs.map((p) => {
            const left = byId.get(p.leftSession);
            const right = byId.get(p.rightSession);
            return (
              <div key={p.id} className="rounded-2xl p-3 flex items-center justify-between gap-3" style={{ background: "#FBF3E3" }}>
                <p className="text-sm" style={{ color: "#121212" }}>
                  <button type="button" className="underline underline-offset-2" onClick={() => left && setOpenId(left.sessionId)}>{labelOf(left)}</button>
                  {" × "}
                  <button type="button" className="underline underline-offset-2" onClick={() => right && setOpenId(right.sessionId)}>{labelOf(right)}</button>
                </p>
                <button
                  onClick={() => refresh(removePair.mutateAsync({ id: Number(p.id) }))}
                  className="text-xs px-3 py-2 rounded-full"
                  style={{ background: "#FFFDF6", color: "#7a7060" }}
                >
                  解除
                </button>
              </div>
            );
          })}
        </div>
      </Card>

      <p className="text-xs mb-3 font-semibold" style={{ color: "#3a7d5c" }}>✅ 参加本周匹配（{inMales.length + inFemales.length} 人）</p>
      <div className="grid md:grid-cols-2 gap-4">
        <Card title={`男生 · ${inMales.length}`}>
          <List users={inMales} pick={pick} onToggle={toggle} onOpen={setOpenId} />
        </Card>
        <Card title={`女生 · ${inFemales.length}`}>
          <List users={inFemales} pick={pick} onToggle={toggle} onOpen={setOpenId} />
        </Card>
      </div>

      <p className="text-xs mb-3 mt-2 font-semibold" style={{ color: "#a3988a" }}>未参加本周匹配（{outMales.length + outFemales.length} 人）</p>
      <div className="grid md:grid-cols-2 gap-4">
        <Card title={`男生 · ${outMales.length}`}>
          <List users={outMales} pick={pick} onToggle={toggle} onOpen={setOpenId} />
        </Card>
        <Card title={`女生 · ${outFemales.length}`}>
          <List users={outFemales} pick={pick} onToggle={toggle} onOpen={setOpenId} />
        </Card>
      </div>

      {openUser && (
        <UserDialog
          user={openUser}
          selected={pick.includes(openUser.sessionId)}
          onClose={() => setOpenId(null)}
          onToggle={() => toggle(openUser.sessionId)}
        />
      )}
    </>
  );
}

/** 照片灯箱：放大查看（滚轮/按钮缩放，拖拽平移）+ 下载原图 */
function PhotoLightbox({ photo, name, onClose }: { photo: { id: number; url: string }; name: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [downloading, setDownloading] = useState(false);

  const zoom = (delta: number) => setScale((s) => Math.min(4, Math.max(1, Math.round((s + delta) * 10) / 10)));
  const doDownload = async () => {
    setDownloading(true);
    try {
      const blob = await (await fetch(photo.url)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}_照片_${photo.id}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ background: "rgba(18,18,18,0.85)" }}
      onClick={onClose}
      onWheel={(e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 0.2 : -0.2); }}
    >
      <div className="flex items-center justify-between p-4" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm" style={{ color: "#F3ECD2" }}>{name} 的照片 · {Math.round(scale * 100)}%</p>
        <div className="flex gap-2">
          <button onClick={() => zoom(-0.5)} className="text-sm px-3 py-1.5 rounded-full" style={{ background: "rgba(255,253,246,0.15)", color: "#F3ECD2" }}>−</button>
          <button onClick={() => zoom(0.5)} className="text-sm px-3 py-1.5 rounded-full" style={{ background: "rgba(255,253,246,0.15)", color: "#F3ECD2" }}>＋</button>
          <button onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }} className="text-sm px-3 py-1.5 rounded-full" style={{ background: "rgba(255,253,246,0.15)", color: "#F3ECD2" }}>重置</button>
          <button onClick={() => void doDownload()} disabled={downloading} className="text-sm px-4 py-1.5 rounded-full disabled:opacity-50" style={{ background: "#F97028", color: "#FFFDF6" }}>
            {downloading ? "下载中…" : "下载原图 ↓"}
          </button>
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-full" style={{ background: "rgba(255,253,246,0.15)", color: "#F3ECD2" }}>关闭</button>
        </div>
      </div>
      <div
        className="flex-1 overflow-hidden flex items-center justify-center"
        style={{ cursor: scale > 1 ? "grab" : "zoom-in" }}
        onClick={(e) => { e.stopPropagation(); if (scale === 1) zoom(1); }}
        onMouseDown={(e) => { drag.current = { x: e.clientX - offset.x, y: e.clientY - offset.y }; }}
        onMouseMove={(e) => { if (drag.current && scale > 1) setOffset({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }); }}
        onMouseUp={() => { drag.current = null; }}
        onMouseLeave={() => { drag.current = null; }}
      >
        <img
          src={photo.url}
          alt=""
          draggable={false}
          className="max-w-full max-h-full object-contain select-none"
          style={{ transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`, transition: drag.current ? "none" : "transform 0.15s" }}
        />
      </div>
    </div>
  );
}

function UserDialog({
  user, selected, onClose, onToggle,
}: {
  user: User;
  selected: boolean;
  onClose: () => void;
  onToggle: () => void;
}) {
  const quiz = quizView(user);
  const detail = trpc.responses.userDetail.useQuery({ sessionId: user.sessionId });
  const d = detail.data;
  const [zoomPhoto, setZoomPhoto] = useState<{ id: number; url: string } | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const cardPerson: CardPerson = {
    name: user.name,
    gender: user.gender,
    birthYear: user.birthYear,
    city: user.city,
    job: user.job,
    height: user.height,
    mbti: user.mbti,
    intro: user.intro,
    expectation: user.expectation,
    value: user.value,
    typeCode: user.typeCode,
    photos: d?.photos ?? [],
  };
  const dp = (d?.datePrefs ?? null) as { locations?: string[]; activities?: string[]; times?: string[]; customLocation?: string; customActivity?: string } | null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(18,18,18,0.45)" }} onClick={onClose}>
      <div className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-3xl p-6" style={{ background: "#FFFDF6" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-3">
          <h2 className="font-display text-xl" style={{ color: "#121212" }}>{user.name}</h2>
          <button onClick={onClose} className="text-sm px-3 py-1 rounded-full" style={{ background: "#FBF3E3", color: "#7a7060" }}>关闭</button>
        </div>

        {/* 照片墙（点击放大，可下载原图） */}
        {d && d.photos.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-2 mb-1">
              {d.photos.map((p: { id: number; url: string }) => (
                <button key={p.id} type="button" onClick={() => setZoomPhoto(p)} className="relative group aspect-square rounded-2xl overflow-hidden" style={{ background: "#F3ECD2" }} title="点击放大 / 下载">
                  <img src={p.url} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                  <span className="absolute bottom-1.5 right-1.5 text-xs px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(18,18,18,0.55)", color: "#FFFDF6" }}>放大</span>
                </button>
              ))}
            </div>
            <p className="text-xs mb-3" style={{ color: "#a3988a" }}>点照片可放大、下载原图</p>
          </>
        )}
        {zoomPhoto && <PhotoLightbox photo={zoomPhoto} name={user.name} onClose={() => setZoomPhoto(null)} />}

        <Row label="微信" value={user.wechat} />
        <Row label="手机" value={d?.profile.phone} />
        <Row label="性别" value={user.gender} />
        <Row label="城市 / 出生年 / 届别" value={`${user.city ?? "—"} · ${user.birthYear ?? "—"} · ${user.gradClass ?? "—"}`} />
        <Row label="MBTI / 身高" value={[user.mbti, user.height].filter(Boolean).join(" · ")} />
        <Row label="职业" value={user.job} />
        <Row
          label="对对方的硬要求"
          value={[
            user.prefMinHeight ? `身高≥${user.prefMinHeight}` : "",
            user.prefBirthFrom || user.prefBirthTo
              ? `出生年 ${user.prefBirthFrom ?? "不限"}–${user.prefBirthTo ?? "不限"}`
              : "",
            user.acceptDistance ? `异地：${user.acceptDistance}` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <Row label="介绍" value={user.intro} />
        <Row label="期待" value={user.expectation} />
        <Row label="看重" value={user.value} />

        {/* 本周约会倾向 */}
        {d && (d.participate || dp) && (
          <div className="mt-3 rounded-xl p-3" style={{ background: d.participate ? "#EAF5EE" : "#FBF3E3" }}>
            <p className="text-xs font-semibold mb-1" style={{ color: "#7a7060" }}>
              本周约会倾向：{d.participate ? "✅ 参加" : "未参加（填过倾向但没开开关）"}
            </p>
            {dp && (
              <p className="text-xs leading-relaxed" style={{ color: "#5a5347" }}>
                {[
                  dp.locations?.length ? `地点：${dp.locations.join("、")}` : "",
                  dp.activities?.length ? `活动：${dp.activities.join("、")}` : "",
                  dp.times?.length ? `时间：${dp.times.join("、")}` : "",
                  dp.customLocation ? `其他地点：${dp.customLocation}` : "",
                  dp.customActivity ? `其他活动：${dp.customActivity}` : "",
                ].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        )}

        <div className="mt-4 pt-4" style={{ borderTop: "1px solid #F3ECD2" }}>
          <p className="font-display text-sm mb-2" style={{ color: "#121212" }}>测评结果</p>
          {quiz.hasQuiz ? (
            <>
              <Row label="恋爱人格" value={`${quiz.typeCode ?? "—"} ${quiz.meme}${quiz.alias ? ` 「${quiz.alias}」` : ""}`} />
              <Row label="爱的语言" value={quiz.langName} />
              <div className="mt-2 flex flex-col gap-2">
                {quiz.dims.map((d) => (
                  <div key={d.title}>
                    <p className="text-xs mb-1" style={{ color: "#a3988a" }}>
                      {d.title}：{d.leftName} {d.left}% · {d.rightName} {d.right}%
                    </p>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "#F3ECD2" }}>
                      <div className="h-full rounded-full" style={{ width: `${d.left}%`, background: d.title === "性别角色" ? "#8ecfc0" : "#F97028" }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm" style={{ color: "#a3988a" }}>没有关联到本次测验作答。</p>
          )}
        </div>

        <div className="mt-4 flex gap-2 flex-wrap">
          <button
            onClick={onToggle}
            className="font-display text-sm px-5 py-2.5 rounded-full"
            style={{ background: selected ? "#F97028" : "#F3ECD2", color: selected ? "#FFFDF6" : "#121212" }}
          >
            {selected ? "已选中" : "选入本对"}
          </button>
          <button
            onClick={() => setCardOpen(true)}
            disabled={!d}
            className="font-display text-sm px-5 py-2.5 rounded-full disabled:opacity-50"
            style={{ background: "#121212", color: "#F3ECD2" }}
          >
            资料卡片 ↓
          </button>
        </div>
        {cardOpen && <MatchCardDialog person={cardPerson} onClose={() => setCardOpen(false)} />}
      </div>
    </div>
  );
}

function VisitPanel() {
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

function labelOf(u?: User) {
  if (!u) return "未知";
  return `${u.name}（${u.typeCode ?? "—"}）`;
}

function List({
  users, pick, onToggle, onOpen,
}: {
  users: User[];
  pick: string[];
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  if (users.length === 0) return <p className="text-sm" style={{ color: "#a3988a" }}>没有未匹配的人</p>;
  return (
    <div className="flex flex-col gap-2">
      {users.map((u) => {
        const selected = pick.includes(u.sessionId);
        const quiz = quizView(u);
        return (
          <div
            key={u.sessionId}
            className="rounded-2xl px-3 py-2.5 flex items-center justify-between gap-2"
            style={{ background: selected ? "#F97028" : "#FBF3E3", color: selected ? "#FFFDF6" : "#121212" }}
          >
            <button type="button" onClick={() => onToggle(u.sessionId)} className="text-left flex-1 min-w-0">
              <p className="font-display text-sm">{u.name} · {u.typeCode ?? "未测"}</p>
              <p className="text-xs truncate" style={{ color: selected ? "rgba(255,253,246,0.8)" : "#a3988a" }}>
                {u.city} · {u.wechat}{quiz.langName ? ` · ${quiz.langName}` : ""}
              </p>
            </button>
            <button
              type="button"
              onClick={() => onOpen(u.sessionId)}
              className="shrink-0 text-xs px-3 py-1.5 rounded-full"
              style={{ background: selected ? "rgba(255,253,246,0.2)" : "#FFFDF6", color: selected ? "#FFFDF6" : "#7a7060" }}
            >
              资料
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Row({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <p className="text-sm leading-relaxed mb-1.5" style={{ color: "#5a5347" }}>
      <span style={{ color: "#a3988a" }}>{label}：</span>{String(value)}
    </p>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl p-5 md:p-6 mb-4" style={{ background: "#FFFDF6", boxShadow: "0 6px 24px rgba(18,18,18,0.06)" }}>
      <h3 className="font-display text-base mb-3" style={{ color: "#121212" }}>{title}</h3>
      {children}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen py-10 px-5" style={{ background: "#F3ECD2" }}>
      <div className="max-w-4xl mx-auto">{children}</div>
    </div>
  );
}
