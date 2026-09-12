import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { trpc } from "@/providers/trpc";
import { trpcErrorMessage } from "@/lib/errors";
import { TYPES, getMeme } from "@/data/types";
import { DIM_META, LOVE_LANGUAGES, type LangKey } from "@/data/questions";
import { computeScoresFinal } from "@/data/questions-final";

type User = {
  sessionId: string;
  name: string;
  wechat: string;
  phone: string;
  gender: string;
  birthYear: number;
  city: string;
  gradClass: string;
  mbti: string | null;
  height: number | null;
  intro: string | null;
  expectation: string | null;
  value: string | null;
  typeCode: string | null;
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
  const [tab, setTab] = useState<"match" | "visits">("match");
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
      <div className="flex gap-2 mb-6">
        <TabBtn active={tab === "match"} onClick={() => setTab("match")}>手动匹配</TabBtn>
        <TabBtn active={tab === "visits"} onClick={() => setTab("visits")}>访问统计</TabBtn>
      </div>
      {tab === "match" ? <MatchPanel /> : <VisitPanel />}
    </Shell>
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
  const males = singles.filter((u) => u.gender === "男");
  const females = singles.filter((u) => u.gender === "女");

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

      <div className="grid md:grid-cols-2 gap-4">
        <Card title={`未匹配男生 · ${males.length}`}>
          <List users={males} pick={pick} onToggle={toggle} onOpen={setOpenId} />
        </Card>
        <Card title={`未匹配女生 · ${females.length}`}>
          <List users={females} pick={pick} onToggle={toggle} onOpen={setOpenId} />
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

function UserDialog({
  user, selected, onClose, onToggle,
}: {
  user: User;
  selected: boolean;
  onClose: () => void;
  onToggle: () => void;
}) {
  const quiz = quizView(user);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(18,18,18,0.45)" }} onClick={onClose}>
      <div className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-3xl p-6" style={{ background: "#FFFDF6" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-3">
          <h2 className="font-display text-xl" style={{ color: "#121212" }}>{user.name}</h2>
          <button onClick={onClose} className="text-sm px-3 py-1 rounded-full" style={{ background: "#FBF3E3", color: "#7a7060" }}>关闭</button>
        </div>
        <Row label="微信" value={user.wechat} />
        <Row label="性别" value={user.gender} />
        <Row label="城市 / 出生年 / 届别" value={`${user.city} · ${user.birthYear} · ${user.gradClass}`} />
        <Row label="MBTI / 身高" value={[user.mbti, user.height].filter(Boolean).join(" · ")} />
        <Row label="介绍" value={user.intro} />
        <Row label="期待" value={user.expectation} />
        <Row label="看重" value={user.value} />

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

        <button
          onClick={onToggle}
          className="mt-4 font-display text-sm px-5 py-2.5 rounded-full"
          style={{ background: selected ? "#F97028" : "#F3ECD2", color: selected ? "#FFFDF6" : "#121212" }}
        >
          {selected ? "已选中" : "选入本对"}
        </button>
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
        <div className="flex items-end gap-1 h-40">
          {days.map((d) => (
            <div key={d.day} className="flex-1 flex flex-col justify-end items-center gap-1 min-w-0">
              <div
                className="w-full rounded-t-sm"
                title={`${d.day} · ${d.count}`}
                style={{ height: `${Math.max(4, (d.count / max) * 100)}%`, background: d.count ? "#F97028" : "#F3ECD2" }}
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
