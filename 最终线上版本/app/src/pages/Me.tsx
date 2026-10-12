import { useRef, useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { trpcErrorMessage } from "@/lib/errors";
import { TYPES, getAvatar, getMeme } from "@/data/types";
import { DIM_META, LOVE_LANGUAGES, type LangKey } from "@/data/questions";
import { computeScoresFinal } from "@/data/questions-final";

function asNumberRecord(raw: Record<string, number> | undefined) {
  const out: Record<number, number> = {};
  for (const [key, value] of Object.entries(raw ?? {})) out[Number(key)] = value;
  return out;
}

type Photo = { id: number; url: string };

type MeData = {
  profile: {
    name: string;
    wechat: string;
    phone: string;
    gender: string;
    birthYear: number;
    city: string;
    gradClass: string;
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
  };
  quiz: { typeCode: string; gender: string; answers: Record<string, number>; rankings: Record<string, string[]>; timings: Record<string, number> } | null;
  photos: Photo[];
};

export default function Me() {
  const preview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "1";
  const me = trpc.responses.memberMe.useQuery(preview ? { preview: true } : undefined, { retry: preview ? 0 : 1 });
  if (preview && me.data) return <Desk data={me.data as MeData} onLogout={() => { window.location.href = "/me"; }} preview />;
  if (me.isLoading) {
    return <Shell><p className="text-center py-20 font-display" style={{ color: "#a3988a" }}>加载中…</p></Shell>;
  }
  if (me.error || !me.data) return <Login onOk={() => void me.refetch()} />;
  return <Desk data={me.data as MeData} onLogout={() => void me.refetch()} />;
}

/* ---------- 登录 ---------- */
function Login({ onOk }: { onOk: () => void }) {
  const send = trpc.responses.sendLoginCode.useMutation();
  const verify = trpc.responses.verifyLoginCode.useMutation();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  return (
    <Shell>
      <div className="max-w-md mx-auto rounded-3xl p-8" style={{ background: "#FFFDF6" }}>
        <p className="font-display text-xs tracking-widest mb-2" style={{ color: "#F97028" }}>同桌的TA</p>
        <h1 className="font-display text-3xl mb-2" style={{ color: "#121212" }}>查看我的结果</h1>
        <p className="text-sm mb-6" style={{ color: "#7a7060" }}>用报名时的手机号收验证码。登录后只能看到你自己的测验和个人资料。</p>
        <label className="block text-xs mb-1" style={{ color: "#a3988a" }}>手机号</label>
        <input
          className="w-full rounded-2xl px-4 py-3 mb-4 outline-none"
          style={{ background: "#FBF6EC", border: "1px solid #E8DCC0" }}
          inputMode="numeric"
          maxLength={11}
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
          placeholder="11 位大陆手机号"
        />
        {sent && (
          <>
            <label className="block text-xs mb-1" style={{ color: "#a3988a" }}>验证码</label>
            <input
              className="w-full rounded-2xl px-4 py-3 mb-4 outline-none tracking-[0.4em]"
              style={{ background: "#FBF6EC", border: "1px solid #E8DCC0" }}
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6 位验证码"
            />
          </>
        )}
        {err && <p className="text-sm mb-3" style={{ color: "#9a3412" }}>{err}</p>}
        {!sent ? (
          <button
            type="button"
            disabled={send.isPending || phone.length !== 11}
            className="w-full font-display text-lg py-3 rounded-full"
            style={{ background: "#F97028", color: "#FFFDF6", opacity: phone.length === 11 ? 1 : 0.5 }}
            onClick={() => {
              setErr("");
              send.mutate({ phone }, {
                onSuccess: () => setSent(true),
                onError: (error) => setErr(trpcErrorMessage(error)),
              });
            }}
          >
            {send.isPending ? "发送中…" : "发送验证码"}
          </button>
        ) : (
          <button
            type="button"
            disabled={verify.isPending || code.length !== 6}
            className="w-full font-display text-lg py-3 rounded-full"
            style={{ background: "#F97028", color: "#FFFDF6", opacity: code.length === 6 ? 1 : 0.5 }}
            onClick={() => {
              setErr("");
              verify.mutate({ phone, code }, {
                onSuccess: onOk,
                onError: (error) => setErr(trpcErrorMessage(error)),
              });
            }}
          >
            {verify.isPending ? "核对中…" : "登录"}
          </button>
        )}
        <Link to="/" className="block text-center text-xs mt-4 underline underline-offset-4" style={{ color: "#7a7060" }}>
          返回测试
        </Link>
        {import.meta.env.DEV && (
          <Link to="/me?preview=1" className="block text-center text-sm mt-3" style={{ color: "#F97028" }}>
            内部预览界面
          </Link>
        )}
      </div>
    </Shell>
  );
}

/* ---------- 艺术字 ---------- */
function ArtText({ children, size = "1.4rem" }: { children: React.ReactNode; size?: string }) {
  return (
    <span
      className="font-display"
      style={{
        fontSize: size,
        background: "linear-gradient(90deg, #F97028, #F489A3)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
      }}
    >
      {children}
    </span>
  );
}

/* ---------- 照片墙（最多 9 张） ---------- */
function PhotoWall({ photos, preview }: { photos: Photo[]; preview: boolean }) {
  const utils = trpc.useUtils();
  const upload = trpc.responses.memberUploadPhoto.useMutation();
  const remove = trpc.responses.memberDeletePhoto.useMutation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");
  const left = 9 - photos.length;

  const pick = async (file: File) => {
    setErr("");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const base64 = dataUrl.split(",")[1] ?? "";
    upload.mutate(
      { mime: file.type, dataBase64: base64 },
      {
        onSuccess: () => void utils.responses.memberMe.invalidate(),
        onError: (e) => setErr(trpcErrorMessage(e, "上传失败")),
      },
    );
  };

  return (
    <div className="rounded-3xl p-6 mb-4" style={{ background: "#FFFDF6" }}>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-display text-lg" style={{ color: "#121212" }}>我的照片</h2>
        <span className="text-xs" style={{ color: "#a3988a" }}>最多 9 张，还能传 {left} 张</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((p) => (
          <div key={p.id} className="relative aspect-square rounded-2xl overflow-hidden" style={{ background: "#F3ECD2" }}>
            <img src={p.url} alt="" className="w-full h-full object-cover" />
            {!preview && (
              <button
                type="button"
                aria-label="删除"
                onClick={() =>
                  remove.mutate({ id: p.id }, {
                    onSuccess: () => void utils.responses.memberMe.invalidate(),
                    onError: (e) => setErr(trpcErrorMessage(e, "删除失败")),
                  })
                }
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full text-xs"
                style={{ background: "rgba(18,18,18,0.55)", color: "#FFFDF6" }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {!preview && left > 0 && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            className="aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 transition-all hover:scale-[1.02] disabled:opacity-50"
            style={{ background: "#FBF3E3", border: "2px dashed #E8DCC0", color: "#F97028" }}
          >
            <span className="text-2xl leading-none">＋</span>
            <span className="text-xs">{upload.isPending ? "上传中…" : "上传照片"}</span>
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
          e.target.value = "";
        }}
      />
      {err && <p className="text-sm mt-2" style={{ color: "#9a3412" }}>{err}</p>}
    </div>
  );
}

/* ---------- 个人信息（可编辑） ---------- */
type EditForm = {
  wechat: string; city: string; gradClass: string; mbti: string; height: string; job: string;
  prefMinHeight: string; prefBirthFrom: string; prefBirthTo: string; acceptDistance: string;
  intro: string; expectation: string; value: string;
};

function ProfileCard({ p, preview }: { p: MeData["profile"]; preview: boolean }) {
  const utils = trpc.useUtils();
  const update = trpc.responses.memberUpdate.useMutation();
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState<EditForm>({
    wechat: p.wechat, city: p.city, gradClass: p.gradClass, mbti: p.mbti ?? "",
    height: p.height ? String(p.height) : "", job: p.job ?? "",
    prefMinHeight: p.prefMinHeight ? String(p.prefMinHeight) : "",
    prefBirthFrom: p.prefBirthFrom ? String(p.prefBirthFrom) : "",
    prefBirthTo: p.prefBirthTo ? String(p.prefBirthTo) : "",
    acceptDistance: p.acceptDistance ?? "",
    intro: p.intro ?? "", expectation: p.expectation ?? "", value: p.value ?? "",
  });

  const set = (k: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const num = (s: string) => (s ? parseInt(s, 10) : null);

  const save = () => {
    setErr("");
    if (form.intro.trim() && form.intro.trim().length < 30) return setErr(`自我介绍至少写 30 字（当前 ${form.intro.trim().length} 字）`);
    update.mutate(
      {
        wechat: form.wechat.trim() || undefined,
        city: form.city.trim() || undefined,
        gradClass: form.gradClass.trim() || undefined,
        mbti: form.mbti.trim().toUpperCase() || undefined,
        height: num(form.height),
        job: form.job.trim() || undefined,
        prefMinHeight: num(form.prefMinHeight),
        prefBirthFrom: num(form.prefBirthFrom),
        prefBirthTo: num(form.prefBirthTo),
        acceptDistance: (form.acceptDistance || null) as "接受" | "不接受" | "看情况" | null,
        intro: form.intro.trim() || undefined,
        expectation: form.expectation.trim() || undefined,
        value: form.value.trim() || undefined,
      },
      {
        onSuccess: () => { setEditing(false); void utils.responses.memberMe.invalidate(); },
        onError: (e) => setErr(trpcErrorMessage(e, "保存失败")),
      },
    );
  };

  const inputCls = "w-full px-3 py-2 rounded-xl text-sm outline-none";
  const inputStyle = { background: "#F3ECD2", color: "#121212" };
  const lbl = (t: string) => <p className="text-xs mb-1" style={{ color: "#a3988a" }}>{t}</p>;

  return (
    <div className="rounded-3xl p-6 mb-4" style={{ background: "#FFFDF6" }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-lg" style={{ color: "#121212" }}>个人信息</h2>
        {!preview && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-sm font-semibold" style={{ color: "#F97028" }}>
            修改
          </button>
        )}
      </div>

      {!editing ? (
        <>
          <Info label="微信" value={p.wechat} />
          <Info label="手机" value={p.phone} />
          <Info label="性别" value={p.gender} />
          <Info label="出生年" value={p.birthYear} />
          <Info label="城市" value={p.city} />
          <Info label="届班" value={p.gradClass} />
          {p.mbti && <p className="text-sm leading-relaxed mb-1.5" style={{ color: "#5a5347" }}><span style={{ color: "#a3988a" }}>MBTI：</span><ArtText size="1.1rem">{p.mbti}</ArtText></p>}
          <Info label="身高" value={p.height ? `${p.height} cm` : ""} />
          <Info label="职业" value={p.job} />
          <Info label="介绍" value={p.intro} />
          <Info label="理想型" value={p.expectation} />
          <Info label="最看重" value={p.value} />
          <Info
            label="对对方的硬要求"
            value={[
              p.prefMinHeight ? `身高≥${p.prefMinHeight}` : "",
              p.prefBirthFrom || p.prefBirthTo ? `出生年 ${p.prefBirthFrom ?? "不限"}–${p.prefBirthTo ?? "不限"}` : "",
              p.acceptDistance ? `异地：${p.acceptDistance}` : "",
            ].filter(Boolean).join(" · ")}
          />
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>{lbl("微信号")}<input className={inputCls} style={inputStyle} value={form.wechat} onChange={set("wechat")} /></div>
            <div>{lbl("城市")}<input className={inputCls} style={inputStyle} value={form.city} onChange={set("city")} /></div>
            <div>{lbl("届班")}<input className={inputCls} style={inputStyle} value={form.gradClass} onChange={set("gradClass")} /></div>
            <div>{lbl("MBTI")}<input className={inputCls} style={inputStyle} value={form.mbti} onChange={set("mbti")} maxLength={4} /></div>
            <div>{lbl("身高（cm）")}<input className={inputCls} style={inputStyle} type="number" value={form.height} onChange={set("height")} /></div>
            <div>{lbl("职业 / 行业")}<input className={inputCls} style={inputStyle} value={form.job} onChange={set("job")} /></div>
          </div>
          <div className="rounded-2xl p-3" style={{ background: "#FBF3E3" }}>
            <p className="text-xs font-semibold mb-2" style={{ color: "#7a7060" }}>对对方的硬要求（可留空）</p>
            <div className="grid grid-cols-3 gap-2">
              <div>{lbl("最低身高")}<input className={inputCls} style={inputStyle} type="number" value={form.prefMinHeight} onChange={set("prefMinHeight")} /></div>
              <div>{lbl("出生年从")}<input className={inputCls} style={inputStyle} type="number" value={form.prefBirthFrom} onChange={set("prefBirthFrom")} /></div>
              <div>{lbl("出生年到")}<input className={inputCls} style={inputStyle} type="number" value={form.prefBirthTo} onChange={set("prefBirthTo")} /></div>
            </div>
            <div className="mt-2">
              {lbl("是否接受异地")}
              <div className="flex gap-2">
                {["不接受", "看情况", "接受"].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, acceptDistance: f.acceptDistance === opt ? "" : opt }))}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold"
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
          <div>{lbl(`自我介绍（至少 30 字，已写 ${form.intro.trim().length} 字）`)}<textarea rows={3} className={inputCls} style={{ ...inputStyle, resize: "none" }} value={form.intro} onChange={set("intro")} maxLength={300} /></div>
          <div>{lbl("理想型")}<textarea rows={2} className={inputCls} style={{ ...inputStyle, resize: "none" }} value={form.expectation} onChange={set("expectation")} maxLength={300} /></div>
          <div>{lbl("最看重")}<textarea rows={2} className={inputCls} style={{ ...inputStyle, resize: "none" }} value={form.value} onChange={set("value")} maxLength={300} /></div>
          {err && <p className="text-sm" style={{ color: "#9a3412" }}>{err}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={update.isPending}
              className="flex-1 font-display text-base py-3 rounded-full disabled:opacity-50"
              style={{ background: "#F97028", color: "#FFFDF6" }}
            >
              {update.isPending ? "保存中…" : "保存"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-6 py-3 rounded-full text-sm font-semibold"
              style={{ background: "#F3ECD2", color: "#7a7060" }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- 主页 ---------- */
function Desk({ data, onLogout, preview = false }: { data: MeData; onLogout: () => void; preview?: boolean }) {
  const logout = trpc.responses.memberLogout.useMutation({ onSuccess: onLogout });
  const p = data.profile;
  const type = data.quiz?.typeCode && TYPES[data.quiz.typeCode] ? TYPES[data.quiz.typeCode] : null;
  const scores = data.quiz
    ? computeScoresFinal(asNumberRecord(data.quiz.answers), data.quiz.rankings as Record<string, LangKey[]>, asNumberRecord(data.quiz.timings))
    : null;
  const dims = scores
    ? DIM_META.map((dim) => {
        const pair = scores[dim.key] as Record<string, number>;
        const left = Math.round((pair[dim.left] / ((pair[dim.left] + pair[dim.right]) || 1)) * 100);
        return { title: dim.title, leftName: dim.leftName, rightName: dim.rightName, left, right: 100 - left };
      })
    : [];
  const topLang = scores
    ? (Object.entries(scores.LL) as [LangKey, number][]).sort((a, b) => b[1] - a[1])[0]?.[0]
    : undefined;

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <Link to="/" className="text-sm underline underline-offset-4" style={{ color: "#7a7060" }}>返回测试</Link>
        {preview ? (
          <span className="text-xs" style={{ color: "#F97028" }}>本地预览，未登录</span>
        ) : (
          <button type="button" onClick={() => logout.mutate()} className="text-sm" style={{ color: "#7a7060" }}>退出</button>
        )}
      </div>

      {/* 人格卡 */}
      <div className="rounded-3xl p-6 md:p-8 mb-4" style={{ background: "#FFFDF6" }}>
        <div className="flex items-center gap-4">
          {type && <img src={getAvatar(type, p.gender)} alt="" className="w-20 h-20 rounded-2xl object-cover" />}
          <div>
            <p className="font-display text-xs tracking-widest" style={{ color: "#F97028" }}>{type ? getMeme(type, p.gender) : "还没有测验结果"}</p>
            <h1 className="font-display text-3xl" style={{ color: "#121212" }}>{p.name}</h1>
            <p className="text-sm" style={{ color: "#7a7060" }}>
              {type ? <>{type.alias} · <ArtText>{type.code}</ArtText></> : "完成测试并报名后，这里会显示你的恋爱人格"}
            </p>
            {p.mbti && (
              <p className="text-sm mt-1" style={{ color: "#7a7060" }}>MBTI <ArtText size="1.1rem">{p.mbti}</ArtText></p>
            )}
          </div>
        </div>
        {type && <p className="text-sm leading-relaxed mt-4" style={{ color: "#5a5347" }}>{type.persona}</p>}
        {topLang && <p className="text-sm mt-3" style={{ color: "#7a7060" }}>爱的语言：{LOVE_LANGUAGES[topLang].name}</p>}
        <div className="mt-4 flex flex-col gap-2">
          {dims.map((dim) => (
            <div key={dim.title}>
              <p className="text-xs mb-1" style={{ color: "#a3988a" }}>{dim.title}：{dim.leftName} {dim.left}% · {dim.rightName} {dim.right}%</p>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "#F3ECD2" }}>
                <div className="h-full rounded-full" style={{ width: `${dim.left}%`, background: "#F97028" }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 text-center">
          <Link
            to="/"
            className="inline-block font-display text-sm px-8 py-3 rounded-full transition-all hover:scale-105"
            style={{ background: "#F3ECD2", color: "#F97028", border: "2px solid #F97028" }}
          >
            重新做一次爱情人格测试 →
          </Link>
        </div>
      </div>

      <PhotoWall photos={data.photos ?? []} preview={preview} />
      <ProfileCard p={p} preview={preview} />
    </Shell>
  );
}

function Info({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null || value === "") return null;
  return <p className="text-sm leading-relaxed mb-1.5" style={{ color: "#5a5347" }}><span style={{ color: "#a3988a" }}>{label}：</span>{String(value)}</p>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen py-10 px-5" style={{ background: "#F3ECD2" }}><div className="max-w-2xl mx-auto">{children}</div></div>;
}
