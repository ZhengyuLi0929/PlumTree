// 「本周同桌的TA」与「我的信箱」两个 tab 的内容（从原 Me.tsx 拆出，逻辑零改动）
import { useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { trpcErrorMessage } from "@/lib/errors";
import MatchCardEmbed from "@/components/MatchCardEmbed";
import type { CardPerson } from "@/lib/matchCard";
import { PaperPlane, Toast, type Photo } from "./_shared";

export function cstDow() {
  return new Date(Date.now() + 8 * 3600 * 1000).getUTCDay(); // 0=周日…6=周六
}
const NOTE_OPEN_DOWS = [3, 4, 5]; // 周三至周五
const FEEDBACK_DOWS = [1, 2]; // 周一周二

export function MatchmakerTab({ preview, name, view }: { preview: boolean; name: string; view: "card" | "chat" }) {
  if (preview) return <MatchmakerPreview name={name} view={view} />;
  return <MatchmakerLive view={view} />;
}

type MatchInfo = {
  match: { id: number; weekKey: string; state: string; reason: string | null; myReply: string | null; partnerReply: string | null } | null;
  partner: { birthYear: number | null; city: string | null; job: string | null; height: number | null; mbti: string | null; intro: string | null; expectation: string | null; value: string | null; gender: string | null; typeCode: string | null; photos: Photo[] } | null;
  notes: { id: number; fromMe: boolean; content: string; createdAt: string }[];
  blessingForMe: string | null;
  quotaLeft: number;
  sim: { date: string; label: string; dow: number } | null;
};

const MATCH_STATE_TEXT: Record<string, string> = {
  sent: "已空投", chatting: "传话中", confirmed: "已确认见面", dating: "约会进行中", declined: "本周不见面",
};

function MatchmakerLive({ view }: { view: "card" | "chat" }) {
  const utils = trpc.useUtils();
  const info = trpc.responses.memberMatchInfo.useQuery(undefined, { refetchInterval: 15000 });
  const sendNote = trpc.responses.memberSendNote.useMutation();
  const botChat = trpc.responses.memberBotChat.useMutation();
  const botHistory = trpc.responses.memberBotHistory.useQuery();
  const feedback = trpc.responses.memberWebFeedback.useMutation();
  const [note, setNote] = useState("");
  const [chatText, setChatText] = useState("");
  const [fb, setFb] = useState<{ score: number; suggestion: string }>({ score: 0, suggestion: "" });
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  };

  const simNext = trpc.responses.memberSimNextDay.useMutation();
  const simReset = trpc.responses.memberSimReset.useMutation();

  const data = info.data as MatchInfo | undefined;
  const dow = data?.sim ? data.sim.dow : cstDow();
  const noteOpen = NOTE_OPEN_DOWS.includes(dow);
  const feedbackOpen = FEEDBACK_DOWS.includes(dow);

  const submitNote = () => {
    const text = note.trim();
    if (!text) return;
    sendNote.mutate({ text }, {
      onSuccess: (r) => {
        if (r.ok) {
          setNote("");
          flash("小纸条已递出");
          void utils.responses.memberMatchInfo.invalidate();
        } else {
          flash(r.error ?? "发送失败");
        }
      },
      onError: (e) => flash(trpcErrorMessage(e, "发送失败")),
    });
  };

  const submitChat = () => {
    const text = chatText.trim();
    if (!text) return;
    setChatText("");
    botChat.mutate({ text }, {
      onSuccess: () => void utils.responses.memberBotHistory.invalidate(),
      onError: () => flash("丘比特这会儿有点忙，等下再聊"),
    });
  };

  const submitFeedback = () => {
    if (fb.score === 0) return flash("先评个星再提交");
    feedback.mutate({ score: fb.score, suggestion: fb.suggestion.trim() || undefined }, {
      onSuccess: (r) => flash(r.ok ? "收到，谢谢你认真反馈" : (r.error ?? "提交失败")),
      onError: (e) => flash(trpcErrorMessage(e, "提交失败")),
    });
  };

  return (
    <>
      {/* 模拟器工具条（灰度内测） */}
      {data?.sim && (
        <div className="rounded-2xl p-4 mb-4 flex items-center justify-between gap-3 flex-wrap" style={{ background: "#121212" }}>
          <p className="font-display text-sm" style={{ color: "#F3ECD2" }}>
            ⏱ 模拟中 · 今天是{data.sim.label}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => simNext.mutate(undefined, { onSuccess: () => void utils.responses.memberMatchInfo.invalidate() })}
              disabled={simNext.isPending}
              className="text-xs font-semibold px-4 py-2 rounded-full disabled:opacity-50"
              style={{ background: "#F97028", color: "#FFFDF6" }}
            >
              进入下一天 →
            </button>
            <button
              type="button"
              onClick={() => simReset.mutate(undefined, { onSuccess: () => { void utils.responses.memberMatchInfo.invalidate(); void utils.responses.memberInvites.invalidate(); void utils.responses.memberDateOptions.invalidate(); } })}
              disabled={simReset.isPending}
              className="text-xs font-semibold px-4 py-2 rounded-full disabled:opacity-50"
              style={{ background: "rgba(255,253,246,0.15)", color: "#F3ECD2" }}
            >
              ↺ 重置到周二
            </button>
          </div>
        </div>
      )}

      {info.error && (
        <p className="text-sm mb-3 rounded-xl p-3" style={{ background: "#FDEAE0", color: "#9a3412" }}>
          网络有点不稳，匹配信息没刷出来。下拉刷新或稍等片刻会自动重试～
        </p>
      )}

      {view === "card" ? (
      <>
      {/* 模拟周二：配对还没影儿 */}
      {data?.sim?.dow === 2 && (
        <div className="rounded-3xl p-8 mb-4 text-center animate-pop" style={{ background: "#FFFDF6", boxShadow: "0 6px 24px rgba(18,18,18,0.06)" }}>
          <div className="text-5xl mb-4">🌙</div>
          <h2 className="font-display text-xl mb-2" style={{ color: "#121212" }}>配对还没影儿呢</h2>
          <p className="text-sm leading-relaxed" style={{ color: "#7a7060" }}>
            别急别急，丘比特周三晚上才上班～<br />这周会有一个很棒的人空降给你，先把「参加本周约会」的开关确认好，养精蓄锐！
          </p>
        </div>
      )}

      {/* 周三首次亮相：丘比特推荐语（而不是对方简介） */}
      {data?.sim?.dow === 3 && data.match && (
        <div className="rounded-3xl p-6 mb-4 animate-pop" style={{ background: "linear-gradient(135deg, #F97028, #F489A3)", boxShadow: "0 8px 28px rgba(249,112,40,0.3)" }}>
          <p className="font-display text-lg mb-1" style={{ color: "#FFFDF6" }}>🎉 配对出炉！</p>
          {data.blessingForMe ? (
            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,253,246,0.95)" }}>{data.blessingForMe}</p>
          ) : (
            <p className="text-sm" style={{ color: "rgba(255,253,246,0.85)" }}>丘比特正在斟酌推荐语…刷新一下看看</p>
          )}
          <p className="text-xs mt-3" style={{ color: "rgba(255,253,246,0.75)" }}>（生产流程：配对先在后台等管理员「确认发送」，这一步在模拟里帮你跳过了）</p>
        </div>
      )}

      {/* 本周配对卡 */}
      <div className="rounded-3xl p-6 mb-4 animate-pop" style={{ background: "#FFFDF6", boxShadow: "0 6px 24px rgba(18,18,18,0.06)" }}>
        <h2 className="font-display text-lg mb-3" style={{ color: "#121212" }}>本周的同桌</h2>
        {info.isLoading && <p className="text-sm" style={{ color: "#a3988a" }}>加载中…</p>}
        {data && !data.match && <p className="text-sm" style={{ color: "#a3988a" }}>本周还没有匹配对象。</p>}
        {data?.match && data.partner && (() => {
          // 周三、周四锁定：照片和介绍要到周五才解锁，先靠小纸条聊天
          const locked = [3, 4].includes(dow);
          const photo = data.partner!.photos[0];
          if (locked) {
            return (
              <div className="relative rounded-2xl overflow-hidden" style={{ background: "#F3ECD2" }}>
                {photo ? (
                  <img src={photo.url} alt="" className="w-full h-56 object-cover" style={{ filter: "blur(20px)", transform: "scale(1.15)" }} />
                ) : (
                  <div className="w-full h-40" style={{ background: "linear-gradient(135deg, #E8DCC0, #F3ECD2)" }} />
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center" style={{ background: "rgba(18,18,18,0.35)" }}>
                  <span className="text-4xl mb-2">🔒</span>
                  <p className="font-display text-base" style={{ color: "#FFFDF6" }}>本周同桌的照片和介绍待解锁</p>
                  <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "rgba(255,253,246,0.85)" }}>
                    先递张小纸条聊聊天吧，周五就揭晓 TA 的照片和自我介绍～
                  </p>
                </div>
              </div>
            );
          }
          const cardPerson: CardPerson = {
            name: "本周同桌",
            gender: data.partner!.gender,
            birthYear: data.partner!.birthYear,
            city: data.partner!.city,
            job: data.partner!.job,
            height: data.partner!.height,
            mbti: data.partner!.mbti,
            intro: data.partner!.intro,
            expectation: data.partner!.expectation,
            value: data.partner!.value,
            typeCode: data.partner!.typeCode,
            photos: data.partner!.photos,
          };
          return (
            <>
              {/* 周五起解锁：完整资料名片（和 admin 资料卡片同一套模板） */}
              <MatchCardEmbed person={cardPerson} />
              <p className="text-xs text-center mt-2" style={{ color: "#a3988a" }}>{MATCH_STATE_TEXT[data.match!.state] ?? data.match!.state}</p>
              {data.blessingForMe && !(data.sim && data.sim.dow === 3) && (
                <details className="rounded-2xl mt-3" style={{ background: "#FBF3E3" }}>
                  <summary className="px-4 py-3 text-sm cursor-pointer select-none" style={{ color: "#F97028" }}>
                    看看丘比特当时怎么说 ▾
                  </summary>
                  <p className="text-sm leading-relaxed px-4 pb-4" style={{ color: "#3d3830" }}>{data.blessingForMe}</p>
                </details>
              )}
            </>
          );
        })()}
      </div>

      {/* 约会安排（周五做见面确认；双方都想见之后安排时间地点） */}
      {data?.match && <DatePlanSection match={data.match} dow={dow} />}

      {/* 约会回访：星级 + 改进意见 */}
      <div className="rounded-3xl p-6 animate-pop" style={{ background: "#FFFDF6", boxShadow: "0 6px 24px rgba(18,18,18,0.06)" }}>
        <h2 className="font-display text-lg mb-1" style={{ color: "#121212" }}>约会回访</h2>
        <p className="text-xs mb-3" style={{ color: "#a3988a" }}>周一、周二开放，说说上周末的约会怎么样。</p>
        {feedbackOpen ? (
          <>
            <p className="text-xs mb-2" style={{ color: "#a3988a" }}>给上周的约会评个分</p>
            <div className="flex gap-1.5 mb-4">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFb((f) => ({ ...f, score: s }))}
                  className="text-3xl leading-none transition-transform hover:scale-110"
                  style={{ color: s <= fb.score ? "#F97028" : "#E8DCC0" }}
                  aria-label={`${s} 星`}
                >
                  {s <= fb.score ? "★" : "☆"}
                </button>
              ))}
            </div>
            <p className="text-xs mb-2" style={{ color: "#a3988a" }}>改进意见：我们如何做的更好？（可选）</p>
            <textarea
              rows={2}
              maxLength={200}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none mb-4"
              style={{ background: "#F3ECD2", color: "#121212", resize: "none" }}
              placeholder="比如推荐的地方太远、时间不合适、想多了解对方哪方面…"
              value={fb.suggestion}
              onChange={(e) => setFb((f) => ({ ...f, suggestion: e.target.value }))}
            />
            <button
              type="button"
              onClick={submitFeedback}
              disabled={feedback.isPending}
              className="w-full font-display text-base py-3 rounded-full disabled:opacity-50"
              style={{ background: "#F97028", color: "#FFFDF6" }}
            >
              {feedback.isPending ? "提交中…" : "提交回访"}
            </button>
          </>
        ) : (
          <p className="text-sm" style={{ color: "#a3988a" }}>还没到回访时间，周一见。</p>
        )}
      </div>
      </>
      ) : (
      /* 我的信箱：小纸条在上、丘比特在下，整栏宽度 */
      <>
      {/* 小纸条 */}
      <div className="rounded-3xl p-6 mb-4 animate-pop" style={{ background: "#FFFDF6", boxShadow: "0 6px 24px rgba(18,18,18,0.06)" }}>
        <h2 className="font-display text-lg mb-1" style={{ color: "#121212" }}>递小纸条</h2>
        <p className="text-xs mb-3" style={{ color: "#a3988a" }}>周三到周五，每天可以给 TA 递一张小纸条。</p>
        {data?.match ? (
          <>
            {data.notes.length > 0 && (
              <div className="flex flex-col gap-2 mb-3 max-h-48 overflow-auto">
                {data.notes.map((n) => (
                  <div key={n.id} className={`text-sm rounded-2xl px-4 py-2.5 max-w-[85%] ${n.fromMe ? "self-end" : "self-start"}`}
                    style={{ background: n.fromMe ? "#F97028" : "#F3ECD2", color: n.fromMe ? "#FFFDF6" : "#121212" }}>
                    {n.content}
                  </div>
                ))}
              </div>
            )}
            {noteOpen ? (
              data.quotaLeft > 0 ? (
                <div className="flex gap-2">
                  <input
                    className="flex-1 px-4 py-3 rounded-xl text-sm outline-none"
                    style={{ background: "#F3ECD2", color: "#121212" }}
                    placeholder="写一句给对方的话…"
                    value={note}
                    maxLength={300}
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) submitNote(); }}
                  />
                  <button
                    type="button"
                    onClick={submitNote}
                    disabled={sendNote.isPending || !note.trim()}
                    className="font-display text-sm px-5 rounded-full disabled:opacity-50 transition-all hover:scale-105"
                    style={{ background: "#F97028", color: "#FFFDF6" }}
                    aria-label="递出小纸条"
                  >
                    {sendNote.isPending ? "…" : (
                      <span className="inline-flex items-center gap-1.5"><PaperPlane />飞出去</span>
                    )}
                  </button>
                </div>
              ) : (
                <p className="text-sm" style={{ color: "#a3988a" }}>今天的小纸条额度用完啦，明天再来。</p>
              )
            ) : (
              <p className="text-sm" style={{ color: "#a3988a" }}>小纸条只在周三、周四、周五可以发送。</p>
            )}
          </>
        ) : (
          <p className="text-sm" style={{ color: "#a3988a" }}>有了本周的同桌之后，就可以递小纸条了。</p>
        )}
      </div>

      {/* 丘比特对话（系统通知也会出现在这里） */}
      <div className="rounded-3xl p-6 mb-4 animate-pop" style={{ background: "#FFFDF6", boxShadow: "0 6px 24px rgba(18,18,18,0.06)" }}>
        <div className="flex items-center gap-3 mb-3">
          <img src="/cupid/preview-b09934.png" alt="丘比特" className="w-11 h-11 rounded-full object-cover" style={{ background: "#FBF3E3", border: "2px solid #F3ECD2" }} />
          <div>
            <h2 className="font-display text-lg" style={{ color: "#121212" }}>和丘比特聊聊</h2>
            <p className="text-xs" style={{ color: "#a3988a" }}>丘比特会记下你说的每一句话。更了解你的偏好才能匹配到更合适的TA哦～</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 mb-3 max-h-64 overflow-auto">
          {(botHistory.data ?? []).length === 0 && !botChat.isPending && (
            <div className="flex items-end gap-2 self-start max-w-[90%]">
              <img src="/cupid/preview-b09934.png" alt="" className="w-8 h-8 rounded-full object-cover shrink-0" style={{ background: "#FBF3E3" }} />
              <div className="text-sm rounded-2xl rounded-bl-sm px-4 py-2.5 leading-relaxed" style={{ background: "#F3ECD2", color: "#121212" }}>
                嗨呀，我是丘比特 🏹 专门管你这周的爱情运势！最近有什么想倾诉的吗？心动瞬间、理想型、感情小烦恼……统统可以跟我说，我超会保密的！
              </div>
            </div>
          )}
          {(botHistory.data ?? []).map((m) =>
            m.fromMe ? (
              <div key={m.id} className="text-sm rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[85%] leading-relaxed self-end"
                style={{ background: "#F97028", color: "#FFFDF6" }}>
                {m.content}
              </div>
            ) : (
              <div key={m.id} className="flex items-end gap-2 self-start max-w-[90%]">
                <img src="/cupid/preview-b09934.png" alt="" className="w-8 h-8 rounded-full object-cover shrink-0" style={{ background: "#FBF3E3" }} />
                <div className="text-sm rounded-2xl rounded-bl-sm px-4 py-2.5 leading-relaxed" style={{ background: "#F3ECD2", color: "#121212" }}>
                  {m.content}
                </div>
              </div>
            ),
          )}
          {botChat.isPending && (
            <div className="flex items-end gap-2 self-start">
              <img src="/cupid/preview-b09934.png" alt="" className="w-8 h-8 rounded-full object-cover shrink-0" style={{ background: "#FBF3E3" }} />
              <p className="text-xs" style={{ color: "#a3988a" }}>丘比特正在输入…</p>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 px-4 py-3 rounded-xl text-sm outline-none"
            style={{ background: "#F3ECD2", color: "#121212" }}
            placeholder="和丘比特说点什么…"
            value={chatText}
            maxLength={500}
            onChange={(e) => setChatText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) submitChat(); }}
          />
          <button
            type="button"
            onClick={submitChat}
            disabled={botChat.isPending || !chatText.trim()}
            className="font-display text-sm px-5 rounded-full disabled:opacity-50"
            style={{ background: "#121212", color: "#F3ECD2" }}
          >
            发送
          </button>
        </div>
      </div>

      </>
      )}
      <Toast msg={toast} />
    </>
  );
}

/* ---------- 约会安排（周五确认后：推荐商家 + 时间交集 + 邀请/反邀请） ---------- */
type MerchantOpt = { id: number; name: string; address: string | null; area: string | null; category: string | null; fit: number };
type DateOpts =
  | { ok: false; error: string }
  | { ok: true; matchId: number; locked: { merchantId: number; timeSlot: string } | null; merchants: MerchantOpt[]; time: { slots: string[]; noOverlap: boolean } };
type InviteRow = { id: number; fromMe: boolean; merchant: string; timeSlot: string; status: string };

/** 自己填地点的选项 id（商家列表之外的固定项） */
const CUSTOM_PLACE = -1;

function DatePlanSection({ match, dow }: { match: NonNullable<MatchInfo["match"]>; dow: number }) {
  const utils = trpc.useUtils();
  const optsQ = trpc.responses.memberDateOptions.useQuery(undefined, { refetchInterval: 15000 });
  const invitesQ = trpc.responses.memberInvites.useQuery(undefined, { refetchInterval: 15000 });
  const send = trpc.responses.memberSendInvite.useMutation();
  const answer = trpc.responses.memberAnswerInvite.useMutation();
  const confirmDate = trpc.responses.memberConfirmDate.useMutation();
  const [merchantId, setMerchantId] = useState<number | null>(null);
  const [customPlace, setCustomPlace] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  };

  const planningOpen = ["confirmed", "dating"].includes(match.state);
  // 周五（含周末）才做见面确认；在那之前这张卡不出现
  const confirmOpen = !planningOpen && [5, 6, 0].includes(dow);
  if (!planningOpen && !confirmOpen) return null;

  const doConfirm = (reply: "yes" | "maybe" | "no") => {
    confirmDate.mutate({ reply }, {
      onSuccess: () => {
        flash(reply === "no" ? "没关系，这周先好好休息，下周再战！" : "好耶！心意已记下，等 TA 也表态就安排起来～");
        void utils.responses.memberMatchInfo.invalidate();
        void utils.responses.memberDateOptions.invalidate();
      },
      onError: (e) => flash(trpcErrorMessage(e, "操作失败")),
    });
  };
  const submitDeclineReason = () => {
    const reason = declineReason.trim();
    if (!reason) return;
    confirmDate.mutate({ reply: "no", reason }, {
      onSuccess: () => setReasonSent(true),
      onError: (e) => flash(trpcErrorMessage(e, "提交失败")),
    });
  };
  const [declineReason, setDeclineReason] = useState("");
  const [reasonSent, setReasonSent] = useState(false);
  const opts = optsQ.data as DateOpts | undefined;
  const invites = (invitesQ.data?.invites ?? []) as InviteRow[];
  const lockedMerchant = opts?.ok && opts.locked ? (opts.merchants.find((m) => m.id === opts.locked!.merchantId)?.name ?? "定好的商家") : null;
  const incoming = invites.find((i) => !i.fromMe && i.status === "pending");
  const outgoing = invites.find((i) => i.fromMe && i.status === "pending");
  const rejectedOut = [...invites].reverse().find((i) => i.fromMe && i.status === "rejected");
  const weekend = [6, 0].includes(dow);

  const doSend = () => {
    const isCustom = merchantId === CUSTOM_PLACE;
    if ((!merchantId || (isCustom && !customPlace.trim())) || !timeSlot) return flash("先选好地点和时间哦");
    if (!confirmed) return flash("记得勾选：已与商家确认时间");
    send.mutate({ merchantId: isCustom ? null : merchantId, timeSlot, customPlace: isCustom ? customPlace.trim() : undefined }, {
      onSuccess: (r) => {
        if (r.ok) {
          flash("邀请飞出去了！TA 接受就成行～");
          setMerchantId(null); setCustomPlace(""); setTimeSlot(""); setConfirmed(false);
          void utils.responses.memberInvites.invalidate();
        } else flash(r.error ?? "发送失败");
      },
      onError: (e) => flash(trpcErrorMessage(e, "发送失败")),
    });
  };

  const doAnswer = (inviteId: number, accept: boolean) => {
    answer.mutate({ inviteId, accept }, {
      onSuccess: (r) => {
        if (r.ok) {
          flash(accept ? "好耶！这周就这么定了 🎉" : "已婉拒，TA 会收到通知再来一版");
          void utils.responses.memberInvites.invalidate();
          void utils.responses.memberDateOptions.invalidate();
          void utils.responses.memberMatchInfo.invalidate();
        } else flash(r.error ?? "操作失败");
      },
      onError: (e) => flash(trpcErrorMessage(e, "操作失败")),
    });
  };

  return (
    <div className="rounded-3xl p-6 mb-4 animate-pop" style={{ background: "#FFFDF6", boxShadow: "0 6px 24px rgba(18,18,18,0.06)" }}>
      <h2 className="font-display text-lg mb-3" style={{ color: "#121212" }}>约会安排</h2>

      {/* 周五见面确认：还没定见不见之前，先不问时间地点 */}
      {!planningOpen && match.state === "declined" && (
        match.myReply === "no" ? (
          <div>
            <p className="text-sm leading-relaxed mb-3" style={{ color: "#5a5347" }}>
              收到～这次就先不安排见面啦，谢谢你按自己的真实感觉做选择。<br />
              如果方便的话，也想请你告诉我们一句：最主要让你决定这次不见面的原因是什么？这会帮助我们下一轮给你更合适的人。
            </p>
            {reasonSent ? (
              <p className="text-sm" style={{ color: "#3a7d5c" }}>已收到，谢谢你 💛</p>
            ) : (
              <div className="flex gap-2">
                <input
                  className="flex-1 px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: "#F3ECD2", color: "#121212" }}
                  placeholder="比如：状态不对、时间不合适、感觉聊不来…"
                  maxLength={200}
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                />
                <button
                  type="button"
                  disabled={confirmDate.isPending || !declineReason.trim()}
                  onClick={submitDeclineReason}
                  className="text-sm px-4 rounded-full disabled:opacity-50"
                  style={{ background: "#121212", color: "#F3ECD2" }}
                >
                  提交
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm leading-relaxed" style={{ color: "#5a5347" }}>
            收到你的选择啦，谢谢你愿意认真考虑这次见面 💛<br />
            这次因为双方最终的见面意愿没有完全对上，所以本周就先不安排线下见面了。<br />
            不用把它理解成对你的评价，大家在第一次匹配时的感觉和状态都会不一样。我们会把这一轮的信息带到后续匹配里，希望下一次能给你一个更合适、双方意愿也更一致的人。
          </p>
        )
      )}
      {!planningOpen && match.state !== "declined" && (
        match.myReply ? (
          <div className="rounded-2xl p-4" style={{ background: "#FBF3E3" }}>
            <p className="text-sm" style={{ color: "#3d3830" }}>
              {match.myReply === "maybe" ? "你说了「TA 愿意你就试试」🤔 " : "你已经举小手啦 ✋ "}
              {[6, 0].includes(dow)
                ? "不过都周末了 TA 还没表态，这周可能赶不上啦——别灰心，下周丘比特继续帮你安排～"
                : "等 TA 也表态，就可以一起挑时间地点咯～"}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm mb-3" style={{ color: "#5a5347" }}>聊了几天啦，本周想和 TA 见一面吗？</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => doConfirm("yes")}
                disabled={confirmDate.isPending}
                className="w-full font-display text-sm py-3 rounded-full disabled:opacity-50 transition-all hover:scale-[1.02]"
                style={{ background: "#F97028", color: "#FFFDF6" }}
              >
                我想与对方见面 💘
              </button>
              <button
                type="button"
                onClick={() => doConfirm("maybe")}
                disabled={confirmDate.isPending}
                className="w-full font-display text-sm py-3 rounded-full disabled:opacity-50"
                style={{ background: "#FFF1E8", color: "#F97028", border: "2px solid #F97028" }}
              >
                有一点犹豫，但如果 TA 也愿意见，我可以试试 🤔
              </button>
              <button
                type="button"
                onClick={() => doConfirm("no")}
                disabled={confirmDate.isPending}
                className="w-full font-display text-sm py-3 rounded-full disabled:opacity-50"
                style={{ background: "#FFFDF6", color: "#7a7060", border: "2px solid #E8DCC0" }}
              >
                本周不想见TA
              </button>
            </div>
          </>
        )
      )}

      {planningOpen && (
      <>
      <p className="text-xs mb-3" style={{ color: "#a3988a" }}>都想见面！挑个地方、选个时间，把约会定下来。</p>

      {/* 已定案 */}
      {opts?.ok && opts.locked && (
        <div className="rounded-2xl p-4" style={{ background: "linear-gradient(135deg, #F97028, #F489A3)" }}>
          <p className="font-display text-lg mb-1" style={{ color: "#FFFDF6" }}>定了！🎉</p>
          <p className="text-sm" style={{ color: "rgba(255,253,246,0.95)" }}>
            {opts.locked.timeSlot} · {lockedMerchant}
          </p>
          <p className="text-xs mt-1" style={{ color: "rgba(255,253,246,0.8)" }}>记得提前一点点到，用心感受约会时光哦～</p>
        </div>
      )}

      {/* 收到邀请 */}
      {!opts?.ok || opts.locked ? null : incoming ? (
        <div className="rounded-2xl p-4 mb-3" style={{ background: "#EAF5EE" }}>
          <p className="font-display text-base mb-1" style={{ color: "#121212" }}>叮咚！TA 发来一个约会邀请 ✉️</p>
          <p className="text-sm mb-3" style={{ color: "#3d3830" }}>{incoming.timeSlot} · {incoming.merchant}</p>
          <div className="flex gap-2">
            <button onClick={() => doAnswer(incoming.id, true)} disabled={answer.isPending}
              className="flex-1 font-display text-sm py-3 rounded-full disabled:opacity-50" style={{ background: "#3a7d5c", color: "#FFFDF6" }}>
              接受！就这了
            </button>
            <button onClick={() => doAnswer(incoming.id, false)} disabled={answer.isPending}
              className="flex-1 font-display text-sm py-3 rounded-full disabled:opacity-50" style={{ background: "#FFFDF6", color: "#7a7060", border: "2px solid #E8DCC0" }}>
              拒绝，我来提一版
            </button>
          </div>
        </div>
      ) : null}

      {/* 等待对方 */}
      {opts?.ok && !opts.locked && outgoing && (
        <div className="rounded-2xl p-4 mb-3" style={{ background: "#FBF3E3" }}>
          <p className="text-sm" style={{ color: "#3d3830" }}>
            你的邀请（{outgoing.timeSlot} · {outgoing.merchant}）正在等 TA 回复～
            {weekend && <span style={{ color: "#9a3412" }}> 都周末啦 TA 还没回，时间有点紧，做好这周转下周的心理准备哦。</span>}
          </p>
        </div>
      )}

      {/* TA 婉拒了我的邀请 */}
      {opts?.ok && !opts.locked && !outgoing && !incoming && rejectedOut && (
        <div className="rounded-2xl p-4 mb-3" style={{ background: "#FDEAE0" }}>
          <p className="text-sm" style={{ color: "#9a3412" }}>
            TA 婉拒了你上一版邀请（{rejectedOut.timeSlot} · {rejectedOut.merchant}）。别气馁，换个时间或地方再发一版～
          </p>
        </div>
      )}

      {/* 发起邀请表单 */}
      {opts?.ok && !opts.locked && (
        <>
          {opts.time.noOverlap && (
            <p className="text-xs mb-3 rounded-xl p-2" style={{ background: "#FDEAE0", color: "#9a3412" }}>
              你俩填的时间没交集，先全量展示了——递张小纸条商量一下呗。
            </p>
          )}
          <p className="text-xs font-semibold mb-1.5" style={{ color: "#3d3830" }}>选个地方（按你俩的口味排的）</p>
          <div className="flex flex-col gap-1.5 mb-3">
            {opts.merchants.slice(0, 6).map((m) => (
              <button key={m.id} type="button" onClick={() => setMerchantId(m.id)}
                className="text-left px-4 py-2.5 rounded-xl text-sm transition-all"
                style={{
                  background: merchantId === m.id ? "#F97028" : "#F3ECD2",
                  color: merchantId === m.id ? "#FFFDF6" : "#121212",
                }}>
                {m.name}
                {m.fit >= 6 ? <span className="text-xs ml-2" style={{ opacity: 0.85 }}>· 超合你俩</span> : m.fit >= 3 ? <span className="text-xs ml-2" style={{ opacity: 0.8 }}>· 挺合适</span> : null}
              </button>
            ))}
            {/* 自定义地点 */}
            <button type="button" onClick={() => setMerchantId(CUSTOM_PLACE)}
              className="text-left px-4 py-2.5 rounded-xl text-sm transition-all"
              style={{
                background: merchantId === CUSTOM_PLACE ? "#F489A3" : "#FBF3E3",
                color: merchantId === CUSTOM_PLACE ? "#FFFDF6" : "#5a5347",
                border: "2px dashed",
                borderColor: merchantId === CUSTOM_PLACE ? "#F489A3" : "#E8DCC0",
              }}>
              以上都不合适，让我自己确定一个地点 ✏️
            </button>
            {merchantId === CUSTOM_PLACE && (
              <input
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={{ background: "#FFFDF6", color: "#121212", border: "2px solid #F489A3" }}
                placeholder="写下你想去的地点或商家名…"
                maxLength={64}
                value={customPlace}
                onChange={(e) => setCustomPlace(e.target.value)}
                autoFocus
              />
            )}
          </div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: "#3d3830" }}>选个时间（你俩的空档交集）</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {opts.time.slots.map((t) => (
              <button key={t} type="button" onClick={() => setTimeSlot(t)}
                className="text-xs px-4 py-2.5 rounded-full font-semibold transition-all"
                style={{
                  background: timeSlot === t ? "#F97028" : "#FFFDF6",
                  color: timeSlot === t ? "#FFFDF6" : "#5a5347",
                  border: "2px solid",
                  borderColor: timeSlot === t ? "#F97028" : "#E8DCC0",
                }}>
                {t}
              </button>
            ))}
          </div>
          <label className="flex items-start gap-2.5 cursor-pointer select-none mb-3">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 shrink-0 accent-[#F97028]" />
            <span className="text-xs leading-relaxed" style={{ color: "#5a5347" }}>
              我已经和商家打电话确认过这个时间有位子，并且那天我会准时到！
            </span>
          </label>
          <button
            type="button"
            onClick={doSend}
            disabled={send.isPending}
            className="w-full font-display text-base py-3.5 rounded-full disabled:opacity-50 transition-all hover:scale-[1.02]"
            style={{ background: "#F97028", color: "#FFFDF6", boxShadow: "0 8px 24px rgba(249,112,40,0.35)" }}
          >
            {send.isPending ? "发送中…" : "发送约会邀请 →"}
          </button>
        </>
      )}
      {optsQ.data && !(optsQ.data as DateOpts).ok && (
        <p className="text-sm" style={{ color: "#a3988a" }}>{(optsQ.data as { error?: string }).error}</p>
      )}
      </>
      )}
      <Toast msg={toast} />
    </div>
  );
}

/** 预览模式下的 beta tab：静态假数据，看个样子 */
function MatchmakerPreview({ name, view }: { name: string; view: "card" | "chat" }) {
  if (view === "chat") {
    return (
      <>
        {["递小纸条（周三至周五，每天一条）", "和丘比特聊聊"].map((t) => (
          <div key={t} className="rounded-3xl p-6 mb-4" style={{ background: "#FFFDF6" }}>
            <h2 className="font-display text-lg" style={{ color: "#121212" }}>{t.split("（")[0]}</h2>
            <p className="text-xs mt-1" style={{ color: "#a3988a" }}>预览模式，登录后这里是真的能聊的。</p>
          </div>
        ))}
      </>
    );
  }
  return (
    <>
      <div className="rounded-3xl p-6 mb-4 animate-pop" style={{ background: "#FFFDF6" }}>
        <h2 className="font-display text-lg mb-3" style={{ color: "#121212" }}>本周的同桌</h2>
        <div className="rounded-2xl p-4 mb-3" style={{ background: "linear-gradient(135deg, #FFF1E8, #FBEDF1)" }}>
          <p className="text-sm font-semibold mb-1" style={{ color: "#121212" }}>
            1998 年生 · 北京 · 产品经理 · 168cm · INFJ<span className="text-xs font-normal ml-2" style={{ color: "#F97028" }}>传话中</span>
          </p>
          <p className="text-xs leading-relaxed mt-1" style={{ color: "#5a5347" }}>周末爬山、做饭、看纪录片，最近在学陶艺。</p>
        </div>
        <div className="rounded-2xl p-4" style={{ background: "#FBF3E3" }}>
          <p className="font-display text-sm mb-1" style={{ color: "#F97028" }}>丘比特悄悄话</p>
          <p className="text-sm leading-relaxed" style={{ color: "#3d3830" }}>
            {name}，听我说！TA 是那个会把「随便吃点」做成四菜一汤的人。你爱看展 TA 爱拍照，你俩站一块就是周末海报本人。别犹豫了，周三给 TA 递张纸条吧！
          </p>
        </div>
      </div>
      {["约会回访（周一、周二）"].map((t) => (
        <div key={t} className="rounded-3xl p-6 mb-4" style={{ background: "#FFFDF6" }}>
          <h2 className="font-display text-lg" style={{ color: "#121212" }}>{t.split("（")[0]}</h2>
          <p className="text-xs mt-1" style={{ color: "#a3988a" }}>预览模式，登录后这里是真的能用的。</p>
        </div>
      ))}
    </>
  );
}
