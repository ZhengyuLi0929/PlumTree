import { useRef, useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { trpcErrorMessage } from "@/lib/errors";
import { TYPES, getAvatar, getMeme } from "@/data/types";
import { DIM_META, LOVE_LANGUAGES, type LangKey } from "@/data/questions";
import { DIM_LEAN } from "@/data/dimExplain";
import { computeScoresFinal } from "@/data/questions-final";
import { MBTI_TYPES } from "@/data/mbti";

function asNumberRecord(raw: Record<string, number> | undefined) {
  const out: Record<number, number> = {};
  for (const [key, value] of Object.entries(raw ?? {})) out[Number(key)] = value;
  return out;
}

type Photo = { id: number; url: string };

type DatePrefs = {
  participate: boolean;
  weekKey?: string;
  locations: string[];
  activities: string[];
  times: string[];
  customLocation?: string;
  customActivity?: string;
};

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
    datePrefs: string | null;
    participate: boolean;
  };
  quiz: { typeCode: string; gender: string; answers: Record<string, number>; rankings: Record<string, string[]>; timings: Record<string, number> } | null;
  photos: Photo[];
};

export default function Me() {
  // 预览口令：/me?preview=142857（线上也可查看；写库只在本地开发环境生效）
  const preview = new URLSearchParams(window.location.search).get("preview") === "142857";
  // 未登录/登录过期的失败立即落到登录页，不再白等一个 retry 周期
  const me = trpc.responses.memberMe.useQuery(preview ? { preview: true } : undefined, {
    retry: preview
      ? 0
      : (failureCount, error) => {
          if (error.message.includes("登录") || error.data?.code === "UNAUTHORIZED") return false;
          return failureCount < 1;
        },
  });
  if (preview && me.data) return <Desk data={me.data as MeData} onLogout={() => { window.location.href = "/me"; }} preview />;
  if (me.isLoading) {
    return <Shell><p className="text-center py-20 font-display" style={{ color: "#a3988a" }}>加载中…</p></Shell>;
  }
  if (me.error || !me.data) return <Login onOk={() => void me.refetch()} />;
  return <Desk data={me.data as MeData} onLogout={() => void me.refetch()} />;
}

/* ---------- 登录（姓名+手机号+密码；短信验证码方式保留在后端，回滚时恢复） ---------- */
function Login({ onOk }: { onOk: () => void }) {
  const login = trpc.responses.memberLoginPassword.useMutation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const ready = name.trim().length > 0 && phone.length === 11 && password.length >= 6;

  const submit = () => {
    setErr("");
    login.mutate(
      { name: name.trim(), phone, password },
      {
        onSuccess: onOk,
        onError: (error) => setErr(trpcErrorMessage(error)),
      },
    );
  };

  return (
    <Shell>
      <div className="max-w-md mx-auto rounded-3xl p-8" style={{ background: "#FFFDF6" }}>
        <p className="font-display text-xs tracking-widest mb-2" style={{ color: "#F97028" }}>同桌的TA</p>
        <h1 className="font-display text-3xl mb-2" style={{ color: "#121212" }}>查看我的结果</h1>
        <p className="text-sm mb-6" style={{ color: "#7a7060" }}>
          用报名时填的姓名和手机号，加上组织者发给你的 8 位密码登录。登录后只能看到你自己的测验和个人资料。
        </p>
        <label className="block text-xs mb-1" style={{ color: "#a3988a" }}>姓名</label>
        <input
          className="w-full rounded-2xl px-4 py-3 mb-4 outline-none"
          style={{ background: "#FBF6EC", border: "1px solid #E8DCC0" }}
          maxLength={64}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="报名时填的姓名"
        />
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
        <label className="block text-xs mb-1" style={{ color: "#a3988a" }}>密码</label>
        <input
          className="w-full rounded-2xl px-4 py-3 mb-2 outline-none"
          style={{ background: "#FBF6EC", border: "1px solid #E8DCC0" }}
          type="password"
          maxLength={32}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="组织者发给你的 8 位密码"
          onKeyDown={(e) => { if (e.key === "Enter" && ready) submit(); }}
        />
        {err && <p className="text-sm mb-3" style={{ color: "#9a3412" }}>{err}</p>}
        <button
          type="button"
          disabled={login.isPending || !ready}
          className="w-full font-display text-lg py-3 rounded-full mt-2"
          style={{ background: "#F97028", color: "#FFFDF6", opacity: ready ? 1 : 0.5 }}
          onClick={submit}
        >
          {login.isPending ? "登录中…" : "登录"}
        </button>
        <p className="text-xs text-center mt-3" style={{ color: "#a3988a" }}>
          还没有密码？找组织者领取你的初始密码。
        </p>
        <Link to="/" className="block text-center text-xs mt-4 underline underline-offset-4" style={{ color: "#7a7060" }}>
          返回测试
        </Link>
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

/* ---------- 浮动提示（保存成功/失败 toast） ---------- */
function Toast({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div
      className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-pop rounded-full px-5 py-2.5 text-sm font-semibold"
      style={{ background: "#121212", color: "#F3ECD2", boxShadow: "0 8px 24px rgba(18,18,18,0.25)" }}
    >
      {msg}
    </div>
  );
}

/* ---------- 照片墙（最多 9 张；预览模式只进本地 state，不调接口） ---------- */
/** 上传前压缩：最长边 1600px、JPEG 0.85。手机原图 5MB → 约 300KB，快且不会撞 nginx 上限 */
async function compressImage(file: File): Promise<{ dataBase64: string; mime: string }> {
  const toBase64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("compress failed"))), "image/jpeg", 0.85));
    return { dataBase64: await toBase64(blob), mime: "image/jpeg" };
  } catch {
    // HEIC 等浏览器解不了的格式：原样传（服务端仍做 8MB 校验）
    return { dataBase64: await toBase64(file), mime: file.type };
  }
}

function PhotoWall({ photos, preview }: { photos: Photo[]; preview: boolean }) {
  const utils = trpc.useUtils();
  const upload = trpc.responses.memberUploadPhoto.useMutation();
  const remove = trpc.responses.memberDeletePhoto.useMutation();
  const fileRef = useRef<HTMLInputElement>(null);
  const localId = useRef(0);
  const [err, setErr] = useState("");
  const [localPhotos, setLocalPhotos] = useState<Photo[]>([]);
  const allPhotos = preview ? [...photos, ...localPhotos] : photos;
  const left = 9 - allPhotos.length;

  const pick = async (file: File) => {
    setErr("");
    if (preview) {
      setLocalPhotos((list) => [...list, { id: -(++localId.current), url: URL.createObjectURL(file) }]);
      return;
    }
    const { dataBase64, mime } = await compressImage(file);
    if (dataBase64.length > 11_000_000) {
      setErr("这张图片太大了，换一张小一点的试试（一般手机照片都没问题）");
      return;
    }
    upload.mutate(
      { mime, dataBase64 },
      {
        onSuccess: () => void utils.responses.memberMe.invalidate(),
        onError: (e) => setErr(trpcErrorMessage(e, "上传失败")),
      },
    );
  };

  const drop = (p: Photo) => {
    setErr("");
    if (p.id < 0) {
      URL.revokeObjectURL(p.url);
      setLocalPhotos((list) => list.filter((x) => x.id !== p.id));
      return;
    }
    if (preview) return;
    remove.mutate({ id: p.id }, {
      onSuccess: () => void utils.responses.memberMe.invalidate(),
      onError: (e) => setErr(trpcErrorMessage(e, "删除失败")),
    });
  };

  return (
    <div className="rounded-3xl p-6 mb-4" style={{ background: "#FFFDF6" }}>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-display text-lg" style={{ color: "#121212" }}>我的照片</h2>
        <span className="text-xs" style={{ color: "#a3988a" }}>最多 9 张，还能传 {left} 张</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {allPhotos.map((p) => (
          <div key={p.id} className="relative aspect-square rounded-2xl overflow-hidden" style={{ background: "#F3ECD2" }}>
            <img src={p.url} alt="" className="w-full h-full object-cover" />
            {(!preview || p.id < 0) && (
              <button
                type="button"
                aria-label="删除"
                onClick={() => drop(p)}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full text-xs"
                style={{ background: "rgba(18,18,18,0.55)", color: "#FFFDF6" }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {left > 0 && (
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
      {preview && <p className="text-xs mt-2" style={{ color: "#a3988a" }}>预览模式，照片不会保存</p>}
      {err && <p className="text-sm mt-2" style={{ color: "#9a3412" }}>{err}</p>}
    </div>
  );
}

/* ---------- 个人信息（表单常驻，直接编辑） ---------- */
type EditForm = {
  name: string; gender: string; birthYear: string; wechat: string; phone: string;
  city: string; gradClass: string; mbti: string; height: string; job: string;
  prefMinHeight: string; prefBirthFrom: string; prefBirthTo: string; acceptDistance: string;
  intro: string; expectation: string; value: string;
};

function ProfileCard({ p, preview }: { p: MeData["profile"]; preview: boolean }) {
  const utils = trpc.useUtils();
  const update = trpc.responses.memberUpdate.useMutation();
  const previewSave = trpc.responses.previewUpdate.useMutation();
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [form, setForm] = useState<EditForm>({
    name: p.name, gender: p.gender, birthYear: p.birthYear ? String(p.birthYear) : "",
    wechat: p.wechat, phone: p.phone,
    city: p.city, gradClass: p.gradClass, mbti: p.mbti ?? "",
    height: p.height ? String(p.height) : "", job: p.job ?? "",
    prefMinHeight: p.prefMinHeight ? String(p.prefMinHeight) : "",
    prefBirthFrom: p.prefBirthFrom ? String(p.prefBirthFrom) : "",
    prefBirthTo: p.prefBirthTo ? String(p.prefBirthTo) : "",
    acceptDistance: p.acceptDistance ?? "",
    intro: p.intro ?? "", expectation: p.expectation ?? "", value: p.value ?? "",
  });

  const set = (k: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const num = (s: string) => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  };
  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  };

  const save = () => {
    setErr("");
    // 自我介绍：留空或未改动就不传（保留原文），传了新内容才校验 30 字
    const introTrimmed = form.intro.trim();
    const introChanged = introTrimmed !== (p.intro ?? "").trim();
    if (introChanged && introTrimmed && introTrimmed.length < 30) {
      return setErr(`自我介绍至少写 30 字（当前 ${introTrimmed.length} 字）`);
    }
    const phone = form.phone.trim();
    if (phone && !/^\d{11}$/.test(phone)) return setErr("手机号是 11 位数字");

    if (preview) {
      // 本地开发：预览也真写库（preview-session 档案）；线上预览：只读查看
      if (!import.meta.env.DEV) return flash("预览模式，仅供查看，不会保存");
      previewSave.mutate(
        {
          profile: {
            name: form.name.trim() || undefined,
            gender: (form.gender || undefined) as "男" | "女" | undefined,
            birthYear: num(form.birthYear),
            wechat: form.wechat.trim() || undefined,
            city: form.city.trim() || null,
            gradClass: form.gradClass.trim() || null,
            mbti: form.mbti.trim().toUpperCase() || null,
            height: num(form.height),
            job: form.job.trim() || null,
            prefMinHeight: num(form.prefMinHeight),
            prefBirthFrom: num(form.prefBirthFrom),
            prefBirthTo: num(form.prefBirthTo),
            acceptDistance: (form.acceptDistance || null) as "接受" | "不接受" | "看情况" | null,
            intro: introChanged && introTrimmed ? introTrimmed : undefined,
            expectation: form.expectation.trim() || undefined,
            value: form.value.trim() || undefined,
          },
        },
        {
          onSuccess: () => { void utils.responses.memberMe.invalidate(); flash("已保存（预览档案）"); },
          onError: (e) => setErr(trpcErrorMessage(e, "保存失败")),
        },
      );
      return;
    }

    update.mutate(
      {
        name: form.name.trim() || undefined,
        gender: (form.gender || undefined) as "男" | "女" | undefined,
        birthYear: num(form.birthYear) ?? undefined,
        phone: phone || undefined,
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
        intro: introChanged && introTrimmed ? introTrimmed : undefined,
        expectation: form.expectation.trim() || undefined,
        value: form.value.trim() || undefined,
      },
      {
        onSuccess: () => { void utils.responses.memberMe.invalidate(); flash("已保存"); },
        onError: (e) => setErr(trpcErrorMessage(e, "保存失败")),
      },
    );
  };

  const inputCls = "w-full px-3 py-2 rounded-xl text-sm outline-none";
  const inputStyle = { background: "#F3ECD2", color: "#121212" };
  const lbl = (t: string) => <p className="text-xs mb-1" style={{ color: "#a3988a" }}>{t}</p>;

  return (
    <div className="rounded-3xl p-6 mb-4" style={{ background: "#FFFDF6" }}>
      <h2 className="font-display text-lg mb-3" style={{ color: "#121212" }}>个人信息</h2>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>{lbl("姓名")}<input className={inputCls} style={inputStyle} value={form.name} onChange={set("name")} maxLength={64} /></div>
          <div>
            {lbl("性别")}
            <div className="flex gap-2">
              {["男", "女"].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, gender: g }))}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold"
                  style={{
                    background: form.gender === g ? "#F97028" : "#FFFDF6",
                    color: form.gender === g ? "#FFFDF6" : "#5a5347",
                    border: "2px solid",
                    borderColor: form.gender === g ? "#F97028" : "#E8DCC0",
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div>{lbl("出生年")}<input className={inputCls} style={inputStyle} type="number" value={form.birthYear} onChange={set("birthYear")} /></div>
          <div>
            {lbl("手机号")}
            <input
              className={inputCls}
              style={inputStyle}
              inputMode="numeric"
              maxLength={11}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 11) }))}
            />
            <p className="text-xs mt-1" style={{ color: "#a3988a" }}>改手机号会影响下次登录用的号码</p>
          </div>
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
        <div>{lbl(`自我介绍（不改或留空则保留原文；重写至少 30 字，已写 ${form.intro.trim().length} 字）`)}<textarea rows={3} className={inputCls} style={{ ...inputStyle, resize: "none" }} value={form.intro} onChange={set("intro")} maxLength={300} /></div>
        <div>{lbl("理想型")}<textarea rows={2} className={inputCls} style={{ ...inputStyle, resize: "none" }} value={form.expectation} onChange={set("expectation")} maxLength={300} /></div>
        <div>{lbl("最看重")}<textarea rows={2} className={inputCls} style={{ ...inputStyle, resize: "none" }} value={form.value} onChange={set("value")} maxLength={300} /></div>
        {err && <p className="text-sm" style={{ color: "#9a3412" }}>{err}</p>}
        <button
          type="button"
          onClick={save}
          disabled={update.isPending || previewSave.isPending}
          className="w-full font-display text-base py-3 rounded-full disabled:opacity-50"
          style={{ background: "#F97028", color: "#FFFDF6" }}
        >
          {update.isPending || previewSave.isPending ? "保存中…" : "保存"}
        </button>
      </div>
      <Toast msg={toast} />
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
        return {
          key: dim.key as string,
          title: dim.title,
          leftName: dim.leftName,
          rightName: dim.rightName,
          leftEn: dim.leftEn,
          rightEn: dim.rightEn,
          leftLetter: dim.left as string,
          rightLetter: dim.right as string,
          left,
          right: 100 - left,
        };
      })
    : [];
  const topLang = scores
    ? (Object.entries(scores.LL) as [LangKey, number][]).sort((a, b) => b[1] - a[1])[0]?.[0]
    : undefined;
  const mbtiInfo = p.mbti ? MBTI_TYPES[p.mbti.toUpperCase()] : undefined;

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4">
        <Link to="/" className="text-sm underline underline-offset-4" style={{ color: "#7a7060" }}>返回测试</Link>
        {preview ? (
          <span className="text-xs" style={{ color: "#F97028" }}>预览模式</span>
        ) : (
          <button type="button" onClick={() => logout.mutate()} className="text-sm" style={{ color: "#7a7060" }}>退出</button>
        )}
      </div>

      {/* 人格卡 */}
      <div className="rounded-3xl p-6 md:p-8 mb-4" style={{ background: "#FFFDF6" }}>
        <div className="flex items-center gap-4">
          {type && <img src={getAvatar(type, p.gender)} alt="" className="w-20 h-20 rounded-2xl object-cover" />}
          <div>
            <h1 className="font-display text-3xl" style={{ color: "#121212" }}>{p.name}</h1>
            <p className="text-base mt-1" style={{ color: "#7a7060" }}>
              {type ? (
                <>
                  <span className="font-display text-xl" style={{ color: "#F97028" }}>{getMeme(type, p.gender)}</span>
                  {"　"}
                  <ArtText>{type.code}</ArtText>
                </>
              ) : "完成测试并报名后，这里会显示你的恋爱人格"}
            </p>
          </div>
        </div>
        {type && <p className="text-sm leading-relaxed mt-4" style={{ color: "#5a5347" }}>{type.persona}</p>}
        {topLang && <p className="text-sm mt-3" style={{ color: "#7a7060" }}>爱的语言：{LOVE_LANGUAGES[topLang].name}</p>}
        <div className="mt-4 flex flex-col gap-3">
          {dims.map((dim) => {
            const leftWin = dim.left >= dim.right;
            const lean = DIM_LEAN[dim.key]?.[leftWin ? dim.leftLetter : dim.rightLetter];
            return (
              <div key={dim.title}>
                <p className="text-xs mb-1" style={{ color: "#a3988a" }}>
                  {dim.title}：
                  <span style={{ color: leftWin ? "#F97028" : "#a3988a" }}>{dim.leftName}（{dim.leftEn}）{dim.left}%</span>
                  {" · "}
                  <span style={{ color: !leftWin ? "#F489A3" : "#a3988a" }}>{dim.rightName}（{dim.rightEn}）{dim.right}%</span>
                </p>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "#F3ECD2" }}>
                  <div className="h-full rounded-full" style={{ width: `${dim.left}%`, background: "#F97028" }} />
                </div>
                {lean && <p className="text-xs leading-relaxed mt-1" style={{ color: "#7a7060" }}>{lean}</p>}
              </div>
            );
          })}
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

      {/* MBTI 卡（独立展示，不混在人格卡里；库里查不到就不渲染） */}
      {mbtiInfo && (
        <div className="rounded-3xl p-6 mb-4" style={{ background: "#FFFDF6" }}>
          <div className="flex items-center gap-4">
            <img src={mbtiInfo.avatar} alt={mbtiInfo.code} className="w-20 h-20 rounded-2xl object-cover" style={{ background: "#F3ECD2" }} />
            <div>
              <ArtText size="2rem">{mbtiInfo.code}</ArtText>
              <p className="font-display text-lg" style={{ color: "#121212" }}>{mbtiInfo.name}</p>
              <p className="text-sm" style={{ color: "#5a5347" }}>{mbtiInfo.love}</p>
            </div>
          </div>
        </div>
      )}

      <PhotoWall photos={data.photos ?? []} preview={preview} />
      <ProfileCard p={p} preview={preview} />
      <DatePrefsCard raw={p.datePrefs} participate={p.participate === true} preview={preview} />
      {!preview && <ChangePasswordCard />}
    </Shell>
  );
}

/* ---------- 修改密码 ---------- */
function ChangePasswordCard() {
  const change = trpc.responses.memberChangePassword.useMutation();
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  };

  const submit = () => {
    setErr("");
    if (newPw !== newPw2) return setErr("两次输入的新密码不一致");
    change.mutate(
      { oldPassword: oldPw, newPassword: newPw },
      {
        onSuccess: () => { setOldPw(""); setNewPw(""); setNewPw2(""); flash("密码已更新，下次登录用新密码"); },
        onError: (e) => setErr(trpcErrorMessage(e, "修改失败")),
      },
    );
  };

  const inputCls = "w-full px-4 py-3 rounded-xl text-sm outline-none";
  const inputStyle = { background: "#F3ECD2", color: "#121212" };
  return (
    <div className="rounded-3xl p-6 mb-4" style={{ background: "#FFFDF6" }}>
      <h2 className="font-display text-lg mb-1" style={{ color: "#121212" }}>修改密码</h2>
      <p className="text-xs mb-4" style={{ color: "#a3988a" }}>初始密码是组织者发的；改成你自己的，之后用手机号+新密码登录。</p>
      <div className="flex flex-col gap-3">
        <input type="password" className={inputCls} style={inputStyle} placeholder="原密码" value={oldPw} onChange={(e) => setOldPw(e.target.value)} maxLength={32} />
        <input type="password" className={inputCls} style={inputStyle} placeholder="新密码（8-32 位，字母+数字）" value={newPw} onChange={(e) => setNewPw(e.target.value)} maxLength={32} />
        <input type="password" className={inputCls} style={inputStyle} placeholder="再输一遍新密码" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} maxLength={32} />
        {err && <p className="text-sm" style={{ color: "#9a3412" }}>{err}</p>}
        <button
          type="button"
          onClick={submit}
          disabled={change.isPending || !oldPw || !newPw}
          className="w-full font-display text-base py-3 rounded-full disabled:opacity-50"
          style={{ background: "#121212", color: "#F3ECD2" }}
        >
          {change.isPending ? "提交中…" : "保存新密码"}
        </button>
      </div>
      <Toast msg={toast} />
    </div>
  );
}

/* ---------- 本周约会倾向（三个多选下拉） ---------- */
const DATE_LOCATIONS = [
  "国贸/CBD", "三里屯/亮马桥", "五道口/中关村", "什刹海/白塔寺/五道营", "五棵松",
];
const DATE_ACTIVITIES = ["一起吃顿饭", "喝杯下午茶", "一起做手工（轧染/画画/拼豆/烘焙）"];
const DATE_TIMES = ["周六上午", "周六下午", "周六晚上", "周日上午", "周日下午", "周日晚上"];
const ALL_OPT = "全部选择";
const MORE_OPT = "更多偏好（请填写）";

function MultiSelect({ label, options, withAll, withMore, values, custom, onChange }: {
  label: string;
  options: string[];
  withAll?: boolean;
  withMore?: boolean;
  values: string[];
  custom: string;
  onChange: (values: string[], custom: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const allOn = options.length > 0 && options.every((o) => values.includes(o));
  const moreOn = values.includes(MORE_OPT);

  const toggle = (opt: string) => {
    if (opt === ALL_OPT) {
      onChange(allOn ? values.filter((v) => !options.includes(v)) : [...new Set([...values, ...options])], custom);
      return;
    }
    onChange(values.includes(opt) ? values.filter((v) => v !== opt) : [...values, opt], custom);
  };

  const summary = values.length === 0
    ? "点击选择…"
    : values.map((v) => (v === MORE_OPT ? (custom.trim() ? `其他：${custom.trim()}` : "更多偏好") : v)).join("、");

  return (
    <div className="mb-4">
      <p className="text-xs font-semibold mb-1.5" style={{ color: "#3d3830" }}>{label}</p>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left px-4 py-3 rounded-xl text-sm flex items-center justify-between gap-2"
        style={{ background: "#F3ECD2", color: values.length ? "#121212" : "#a3988a" }}
      >
        <span className="truncate">{summary}</span>
        <span style={{ color: "#a3988a" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-2 rounded-2xl p-2 flex flex-wrap gap-2" style={{ background: "#FBF3E3" }}>
          {(withAll ? [ALL_OPT, ...options] : [...options]).map((opt) => {
            const on = opt === ALL_OPT ? allOn : values.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className="text-xs px-3 py-2 rounded-full font-semibold transition-all"
                style={{
                  background: on ? "#F97028" : "#FFFDF6",
                  color: on ? "#FFFDF6" : "#5a5347",
                  border: "2px solid",
                  borderColor: on ? "#F97028" : "#E8DCC0",
                }}
              >
                {opt}
              </button>
            );
          })}
          {withMore && (
            <button
              type="button"
              onClick={() => toggle(MORE_OPT)}
              className="text-xs px-3 py-2 rounded-full font-semibold transition-all"
              style={{
                background: moreOn ? "#F489A3" : "#FFFDF6",
                color: moreOn ? "#FFFDF6" : "#5a5347",
                border: "2px solid",
                borderColor: moreOn ? "#F489A3" : "#E8DCC0",
              }}
            >
              {MORE_OPT}
            </button>
          )}
          {withMore && moreOn && (
            <input
              className="w-full px-3 py-2 rounded-xl text-sm outline-none mt-1"
              style={{ background: "#FFFDF6", color: "#121212" }}
              placeholder="请填写你的偏好"
              value={custom}
              maxLength={100}
              onChange={(e) => onChange(values, e.target.value)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function DatePrefsCard({ raw, participate: initialParticipate, preview }: { raw: string | null; participate: boolean; preview: boolean }) {
  const utils = trpc.useUtils();
  const save = trpc.responses.memberSaveDatePrefs.useMutation();
  const previewSave = trpc.responses.previewUpdate.useMutation();
  const parsed = (() => {
    try {
      return raw ? (JSON.parse(raw) as Partial<DatePrefs>) : {};
    } catch {
      return {};
    }
  })();
  const [participate, setParticipate] = useState(initialParticipate);
  const [locations, setLocations] = useState<string[]>(parsed.locations ?? []);
  const [activities, setActivities] = useState<string[]>(parsed.activities ?? []);
  const [times, setTimes] = useState<string[]>(parsed.times ?? []);
  const [customLocation, setCustomLocation] = useState(parsed.customLocation ?? "");
  const [customActivity, setCustomActivity] = useState(parsed.customActivity ?? "");
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  };

  const submit = () => {
    setErr("");
    if (locations.includes(MORE_OPT) && !customLocation.trim()) return setErr("选择了「更多偏好」就请填写具体地点");
    if (activities.includes(MORE_OPT) && !customActivity.trim()) return setErr("选择了「更多偏好」就请填写具体活动");
    const payload: DatePrefs = {
      participate,
      locations,
      activities,
      times,
      customLocation: customLocation.trim() || undefined,
      customActivity: customActivity.trim() || undefined,
    };
    if (preview) {
      if (!import.meta.env.DEV) return flash("预览模式，仅供查看，不会保存");
      previewSave.mutate(
        { datePrefs: payload },
        {
          onSuccess: () => { void utils.responses.memberMe.invalidate(); flash("已保存（预览档案）"); },
          onError: (e) => setErr(trpcErrorMessage(e, "保存失败")),
        },
      );
      return;
    }
    save.mutate(payload, {
      onSuccess: () => { void utils.responses.memberMe.invalidate(); flash("已保存"); },
      onError: (e) => setErr(trpcErrorMessage(e, "保存失败")),
    });
  };

  return (
    <div className="rounded-3xl p-6 mb-4" style={{ background: "#FFFDF6" }}>
      <h2 className="font-display text-lg mb-1" style={{ color: "#121212" }}>本周约会倾向</h2>
      <p className="text-xs mb-4" style={{ color: "#a3988a" }}>告诉月老你这周想去哪、想做什么、什么时候有空。</p>
      {/* 参加开关：默认不参加，手动打开才进本周匹配；下周自动回到不参加 */}
      <div
        className="flex items-center justify-between rounded-2xl p-4 mb-4"
        style={{ background: participate ? "#EAF5EE" : "#FBF3E3" }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: "#121212" }}>参加本周约会匹配</p>
          <p className="text-xs mt-0.5" style={{ color: "#7a7060" }}>
            {participate ? "已参加：本周三会给你排一位对象" : "默认不参加，打开开关才会被排进本周匹配（下周一自动关闭）"}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={participate}
          onClick={() => setParticipate(!participate)}
          className="relative w-14 h-8 rounded-full transition-colors shrink-0"
          style={{ background: participate ? "#3a7d5c" : "#E8DCC0" }}
        >
          <span
            className="absolute top-1 w-6 h-6 rounded-full transition-all"
            style={{ left: participate ? "calc(100% - 28px)" : "4px", background: "#FFFDF6", boxShadow: "0 1px 4px rgba(18,18,18,0.2)" }}
          />
        </button>
      </div>
      <div style={{ opacity: participate ? 1 : 0.45, pointerEvents: participate ? "auto" : "none" }}>
        <MultiSelect
          label="倾向的见面地点（可多选）"
          options={DATE_LOCATIONS}
          withAll
          withMore
          values={locations}
          custom={customLocation}
          onChange={(v, c) => { setLocations(v); setCustomLocation(c); }}
        />
        <MultiSelect
          label="倾向的约会活动（可多选）"
          options={DATE_ACTIVITIES}
          withAll
          withMore
          values={activities}
          custom={customActivity}
          onChange={(v, c) => { setActivities(v); setCustomActivity(c); }}
        />
        <MultiSelect
          label="倾向的约会时间（可多选）"
          options={DATE_TIMES}
          values={times}
          custom=""
          onChange={(v) => setTimes(v)}
        />
      </div>
      {err && <p className="text-sm mb-2" style={{ color: "#9a3412" }}>{err}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={save.isPending || previewSave.isPending}
        className="w-full font-display text-base py-3 rounded-full disabled:opacity-50"
        style={{ background: "#F97028", color: "#FFFDF6" }}
      >
        {save.isPending || previewSave.isPending ? "保存中…" : "保存本周倾向"}
      </button>
      <Toast msg={toast} />
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen py-10 px-5" style={{ background: "#F3ECD2" }}><div className="max-w-2xl mx-auto">{children}</div></div>;
}
