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
    job: "",
    prefMinHeight: "",
    prefBirthFrom: "",
    prefBirthTo: "",
    acceptDistance: "",
    intro: "",
    expectation: "",
    value: "",
  });
  const [err, setErr] = useState("");
  const [consent, setConsent] = useState(false);

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const parseYear = (s: string) => (s ? parseInt(s, 10) : undefined);

  const submit = () => {
    setErr("");
    if (!form.name.trim()) return setErr("请填写姓名");
    const by = parseInt(form.birthYear, 10);
    if (!by || by < 1946 || by > 2010) return setErr("请填写正确的出生年份");
    const thisYear = new Date().getFullYear();
    if (gender === "男" && by > thisYear - 22) return setErr("男生要满 22 岁（法定婚龄）才能参加哦，过两年再来～");
    if (gender === "女" && by > thisYear - 20) return setErr("女生要满 20 岁（法定婚龄）才能参加哦，过两年再来～");
    if (!form.city.trim()) return setErr("请填写所在城市");
    if (!form.gradClass.trim()) return setErr("请填写毕业届别和班级，如 2016届3班");
    if (form.intro.trim().length < 30) return setErr(`自我介绍至少写 30 字（当前 ${form.intro.trim().length} 字），匹配要靠它了解你`);
    if (!consent) return setErr("请先阅读并勾选《隐私政策》");
    const from = parseYear(form.prefBirthFrom);
    const to = parseYear(form.prefBirthTo);
    if (from && to && from > to) return setErr("期望出生年范围下限不能大于上限");
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
        job: form.job.trim() || undefined,
        prefMinHeight: form.prefMinHeight ? parseInt(form.prefMinHeight, 10) : undefined,
        prefBirthFrom: from,
        prefBirthTo: to,
        acceptDistance: (form.acceptDistance || undefined) as "接受" | "不接受" | "看情况" | undefined,
        intro: form.intro.trim(),
        expectation: form.expectation.trim() || undefined,
        value: form.value.trim() || undefined,
        consent: true,
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
            <div>{label("职业 / 行业")}<input className={inputCls} style={inputStyle} value={form.job} onChange={set("job")} placeholder="如 互联网产品经理 / 医生 / 在读博士" maxLength={64} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>{label("MBTI")}<input className={inputCls} style={inputStyle} value={form.mbti} onChange={set("mbti")} placeholder="如 INFP" maxLength={4} /></div>
              <div>{label("身高（cm）")}<input className={inputCls} style={inputStyle} type="number" value={form.height} onChange={set("height")} placeholder="如 172" /></div>
            </div>

            {/* 结构化雷区：对对方的硬要求 */}
            <div className="rounded-2xl p-4" style={{ background: "#FBF3E3" }}>
              <p className="text-sm font-semibold mb-1" style={{ color: "#3d3830" }}>对对方的硬要求（都可选）</p>
              <p className="text-xs mb-3" style={{ color: "#7a7060" }}>写了就会作为匹配的硬参考；不写表示没有硬性要求。</p>
              <div className="grid grid-cols-2 gap-3">
                <div>{label("对方最低身高（cm）")}<input className={inputCls} style={inputStyle} type="number" value={form.prefMinHeight} onChange={set("prefMinHeight")} placeholder="如 170" /></div>
                <div>
                  {label("对方出生年范围")}
                  <div className="flex items-center gap-2">
                    <input className={inputCls} style={inputStyle} type="number" value={form.prefBirthFrom} onChange={set("prefBirthFrom")} placeholder="1994" />
                    <span className="text-sm shrink-0" style={{ color: "#a3988a" }}>–</span>
                    <input className={inputCls} style={inputStyle} type="number" value={form.prefBirthTo} onChange={set("prefBirthTo")} placeholder="2000" />
                  </div>
                </div>
              </div>
              <div className="mt-3">
                {label("是否接受异地")}
                <div className="flex gap-2">
                  {["不接受", "看情况", "接受"].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, acceptDistance: f.acceptDistance === opt ? "" : opt }))}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                      style={{
                        background: form.acceptDistance === opt ? "#F97028" : "#FFFDF6",
                        color: form.acceptDistance === opt ? "#FFFDF6" : "#5a5347",
                        border: "2px solid",
                        borderColor: form.acceptDistance === opt ? "#F97028" : "#E8DCC0",
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              {label(`介绍一下自己（至少 30 字，已写 ${form.intro.trim().length} 字）`, true)}
              <textarea className={inputCls} style={{ ...inputStyle, resize: "none" }} rows={3} value={form.intro} onChange={set("intro")} placeholder="随便写：工作、爱好、最近在忙什么…写得越具体，匹配越准" maxLength={300} />
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
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0 accent-[#F97028]"
              />
              <span className="text-xs leading-relaxed" style={{ color: "#5a5347" }}>
                我已阅读并同意
                <a href="/privacy" target="_blank" className="underline underline-offset-2 font-semibold" style={{ color: "#F97028" }}>《隐私政策》</a>
                ，知晓我的择偶偏好等敏感个人信息仅用于本次校友匹配。
              </span>
            </label>
            <button
              onClick={submit}
              disabled={register.isPending || !consent}
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
