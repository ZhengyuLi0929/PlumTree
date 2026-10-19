// 手动匹配 tab（/admin/match）：配对名单 + 资料弹窗（含照片灯箱、资料卡片下载）
import { useMemo, useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { trpcErrorMessage } from "@/lib/errors";
import { downloadCardHtml, downloadCardImage, type CardPerson } from "@/lib/matchCard";
import MatchCardEmbed from "@/components/MatchCardEmbed";
import { Card, Row, quizView, type User } from "./_shared";

export default function AdminMatch() {
  return <MatchPanel />;
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

/** 资料卡片弹窗：竖版名片（含理想型/最看重/丘比特小猫），可下载 PNG/JPEG/HTML */
function MatchCardDialog({ person, onClose }: { person: CardPerson; onClose: () => void }) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

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
      <div className="w-full max-w-lg max-h-[90vh] overflow-auto rounded-3xl p-6" style={{ background: "#FFFDF6" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <h2 className="font-display text-xl" style={{ color: "#121212" }}>{person.name} · 资料卡片</h2>
          <button onClick={onClose} className="text-sm px-3 py-1 rounded-full" style={{ background: "#FBF3E3", color: "#7a7060" }}>关闭</button>
        </div>
        <div className="mb-4 rounded-2xl py-3" style={{ background: "#fff9f0", border: "1px solid #F3ECD2" }}>
          <MatchCardEmbed person={person} photoIdx={photoIdx} onPhotoIdx={setPhotoIdx} />
        </div>
        {person.photos.length > 1 && (
          <p className="text-xs mb-3" style={{ color: "#a3988a" }}>卡片照片区可翻页，导出的是当前展示的这一张。</p>
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
