import { useState } from "react";
import type { ChangeEvent } from "react";
import { trpc } from "@/providers/trpc";
import { trpcErrorMessage } from "@/lib/errors";

type Gender = "男" | "女";

export function ProfileForm({
  sessionId,
  gender,
  wechat,
  token,
  onBack,
  onDone,
}: {
  sessionId: string;
  gender: Gender;
  wechat: string;
  token: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const register = trpc.responses.register.useMutation();
  const [form, setForm] = useState({
    name: "",
    birthYear: "",
    city: "",
    gradClass: "",
    mbti: "",
    height: "",
    intro: "",
    expectation: "",
    value: "",
  });
  const [err, setErr] = useState("");

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    setErr("");
    if (!form.name.trim()) return setErr("请填写姓名");
    const by = parseInt(form.birthYear, 10);
    if (!by || by < 1946 || by > 2010) return setErr("请填写正确的出生年份");
    if (!form.city.trim()) return setErr("请填写所在城市");
    if (!form.gradClass.trim()) return setErr("请填写毕业届别和班级，如 2016届3班");
    register.mutate(
      {
        token,
        sessionId,
        name: form.name.trim(),
        gender,
        birthYear: by,
        city: form.city.trim(),
        gradClass: form.gradClass.trim(),
        mbti: form.mbti.trim().toUpperCase() || undefined,
        height: form.height ? parseInt(form.height, 10) : undefined,
        intro: form.intro.trim() || undefined,
        expectation: form.expectation.trim() || undefined,
        value: form.value.trim() || undefined,
      },
      {
        onSuccess: () => onDone(),
        onError: (e) => setErr(trpcErrorMessage(e, "提交失败，请检查网络后再试一次")),
      },
    );
  };

  const inputCls = "w-full px-4 py-3 rounded-xl text-sm outline-none transition-all";
  const inputStyle = { background: "#F3ECD2", color: "#121212", border: "2px solid transparent" };
  const label = (text: string, required = false) => (
    <p className="text-sm font-semibold mb-1.5" style={{ color: "#3d3830" }}>
      {text}{required && <span style={{ color: "#F97028" }}> *</span>}
    </p>
  );

  return (
    <div className="min-h-screen pb-16" style={{ background: "linear-gradient(180deg, #F3ECD2 0%, #F9E3C8 60%, #F3ECD2 100%)" }}>
      <div className="max-w-xl mx-auto px-5 pt-10">
        <button onClick={onBack} className="text-sm font-semibold mb-6" style={{ color: "#121212" }}>
          ← 返回结果
        </button>
        <div className="rounded-3xl p-6 md:p-7 animate-pop" style={{ background: "#FFFDF6", boxShadow: "0 6px 24px rgba(18,18,18,0.06)" }}>
          <h1 className="font-display text-2xl mb-2" style={{ color: "#121212" }}>填写匹配资料</h1>
          <p className="text-xs leading-relaxed mb-5" style={{ color: "#7a7060" }}>
            微信 {wechat} 已记录。以下信息只用于校友匹配，不会公开展示。
          </p>
          <div className="flex flex-col gap-4">
            <div>{label("姓名", true)}<input className={inputCls} style={inputStyle} value={form.name} onChange={set("name")} placeholder="真实姓名" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>{label("出生年份", true)}<input className={inputCls} style={inputStyle} type="number" value={form.birthYear} onChange={set("birthYear")} placeholder="如 1998" /></div>
              <div>{label("所在城市", true)}<input className={inputCls} style={inputStyle} value={form.city} onChange={set("city")} placeholder="如 北京" /></div>
            </div>
            <div>{label("毕业届别和班级", true)}<input className={inputCls} style={inputStyle} value={form.gradClass} onChange={set("gradClass")} placeholder="如 2016届3班" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>{label("MBTI")}<input className={inputCls} style={inputStyle} value={form.mbti} onChange={set("mbti")} placeholder="如 INFP" maxLength={4} /></div>
              <div>{label("身高（cm）")}<input className={inputCls} style={inputStyle} type="number" value={form.height} onChange={set("height")} placeholder="如 172" /></div>
            </div>
            <div>
              {label("三句话介绍一下自己")}
              <textarea className={inputCls} style={{ ...inputStyle, resize: "none" }} rows={3} value={form.intro} onChange={set("intro")} placeholder="随便写：工作、爱好、最近在忙什么…" maxLength={300} />
            </div>
            <div>
              {label("期待认识什么样的人")}
              <textarea className={inputCls} style={{ ...inputStyle, resize: "none" }} rows={2} value={form.expectation} onChange={set("expectation")} placeholder="说说你的理想型或雷区" maxLength={300} />
            </div>
            <div>
              {label("一段关系里，你最看重什么")}
              <textarea className={inputCls} style={{ ...inputStyle, resize: "none" }} rows={2} value={form.value} onChange={set("value")} placeholder="一句话就好" maxLength={300} />
            </div>
            {err && <p className="text-sm font-semibold" style={{ color: "#F97028" }}>{err}</p>}
            <button
              onClick={submit}
              disabled={register.isPending}
              className="font-display text-lg py-4 rounded-full transition-all duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-50"
              style={{ background: "#F97028", color: "#FFFDF6", boxShadow: "0 8px 24px rgba(249,112,40,0.35)" }}
            >
              {register.isPending ? "提交中…" : "提交，进入匹配池 →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
