// /admin 各 tab 共享的基础组件与类型（从原 Admin.tsx 拆出，逻辑零改动）
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { trpc } from "@/providers/trpc";
import { trpcErrorMessage } from "@/lib/errors";
import { TYPES, getMeme } from "@/data/types";
import { DIM_META, LOVE_LANGUAGES, type LangKey } from "@/data/questions";
import { computeScoresFinal } from "@/data/questions-final";

export type User = {
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

export function asNumberRecord(raw: Record<string, number>) {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(raw ?? {})) out[Number(k)] = v;
  return out;
}

export function quizView(u: User) {
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

export function AdminLogin({ onOk }: { onOk: () => void }) {
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

export function Row({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <p className="text-sm leading-relaxed mb-1.5" style={{ color: "#5a5347" }}>
      <span style={{ color: "#a3988a" }}>{label}：</span>{String(value)}
    </p>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl p-5 md:p-6 mb-4" style={{ background: "#FFFDF6", boxShadow: "0 6px 24px rgba(18,18,18,0.06)" }}>
      <h3 className="font-display text-base mb-3" style={{ color: "#121212" }}>{title}</h3>
      {children}
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen py-10 px-5" style={{ background: "#F3ECD2" }}>
      <div className="max-w-4xl mx-auto">{children}</div>
    </div>
  );
}
