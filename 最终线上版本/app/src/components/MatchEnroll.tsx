import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { trpcErrorMessage } from "@/lib/errors";

export type EnrollPayload = { wechat: string; token: string };

type Props = {
  sessionId: string;
  profileDone: boolean;
  enrolled: boolean;
  onEnrolled: (payload: EnrollPayload) => void;
  onContinueProfile: () => void;
};

export function MatchIntro({ sessionId, profileDone, enrolled, onEnrolled, onContinueProfile }: Props) {
  const [open, setOpen] = useState(false);

  if (profileDone) {
    return (
      <div className="rounded-3xl p-6 mb-4 animate-pop" style={{ background: "#EAF5EE", boxShadow: "0 6px 24px rgba(18,18,18,0.06)" }}>
        <p className="font-display text-lg mb-2" style={{ color: "#121212" }}>你已加入本周匹配</p>
        <p className="text-sm leading-relaxed" style={{ color: "#5a5347" }}>
          每周三微信机器人会发给你一位对象和理由；周三周四可互传一句话；周五零点前确认是否见面，周末赴约；周一周二回收反馈。
        </p>
      </div>
    );
  }

  if (enrolled) {
    return (
      <div className="rounded-3xl p-6 mb-4 animate-pop" style={{ background: "#FFFDF6", boxShadow: "0 6px 24px rgba(18,18,18,0.06)" }}>
        <p className="font-display text-lg mb-2" style={{ color: "#121212" }}>邀请码已确认</p>
        <p className="text-sm mb-4" style={{ color: "#5a5347" }}>再填几项资料，就可以进入匹配池。</p>
        <button
          onClick={onContinueProfile}
          className="font-display text-base px-8 py-3 rounded-full transition-all hover:scale-105"
          style={{ background: "#F97028", color: "#FFFDF6" }}
        >
          继续填写资料 →
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-3xl p-6 md:p-8 mb-4 animate-pop" style={{ background: "#FFFDF6", boxShadow: "0 10px 32px rgba(249,112,40,0.12)" }}>
        <p className="font-display text-xs tracking-widest mb-2" style={{ color: "#F97028" }}>同桌的TA · 每周恋爱匹配</p>
        <h3 className="font-display text-2xl mb-3" style={{ color: "#121212" }}>想认识校友？参加每周恋爱匹配</h3>
        <ol className="text-sm leading-loose mb-6 pl-4" style={{ color: "#5a5347", listStyle: "decimal" }}>
          <li>周三：微信收到本周对象和推荐理由</li>
          <li>周三、周四：可通过机器人互传一句话（每人每天一条）</li>
          <li>周五零点前确认是否见面</li>
          <li>周五收到时间和地点，周末赴约</li>
          <li>周一、周二：收到上周约会反馈，用来调整下周匹配</li>
        </ol>
        <button
          onClick={() => setOpen(true)}
          className="font-display text-xl w-full py-5 rounded-full transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: "#F97028", color: "#FFFDF6", boxShadow: "0 12px 32px rgba(249,112,40,0.42)" }}
        >
          参与每周恋爱匹配
        </button>
      </div>
      {open && (
        <EnrollDialog
          sessionId={sessionId}
          onClose={() => setOpen(false)}
          onEnrolled={(payload) => {
            setOpen(false);
            onEnrolled(payload);
          }}
        />
      )}
    </>
  );
}

function EnrollDialog({
  sessionId,
  onClose,
  onEnrolled,
}: {
  sessionId: string;
  onClose: () => void;
  onEnrolled: (payload: EnrollPayload) => void;
}) {
  const startEnroll = trpc.responses.startEnroll.useMutation();
  const [wechat, setWechat] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [err, setErr] = useState("");

  const inputCls = "w-full px-4 py-3 rounded-xl text-sm outline-none";
  const inputStyle = { background: "#F3ECD2", color: "#121212" };

  const confirm = () => {
    setErr("");
    startEnroll.mutate(
      { sessionId, wechat, inviteCode },
      {
        onSuccess: (res) => onEnrolled({ wechat: res.wechat, token: res.token }),
        onError: (e) => setErr(trpcErrorMessage(e, "验证失败")),
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(18,18,18,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl p-6 animate-pop max-h-[90vh] overflow-auto"
        style={{ background: "#FFFDF6", boxShadow: "0 12px 40px rgba(18,18,18,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-xl mb-2" style={{ color: "#121212" }}>加入每周匹配</h3>
        <p className="text-xs leading-relaxed mb-5" style={{ color: "#7a7060" }}>
          填写邀请码和微信号即可进入资料页。信息只用于校友匹配，不会公开展示。
        </p>
        <div className="flex flex-col gap-3">
          <label className="text-sm font-semibold" style={{ color: "#3d3830" }}>
            邀请码
            <input className={`${inputCls} mt-1.5`} style={inputStyle} value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="校友现场提供" autoComplete="off" />
          </label>
          <label className="text-sm font-semibold" style={{ color: "#3d3830" }}>
            微信号
            <input className={`${inputCls} mt-1.5`} style={inputStyle} value={wechat} onChange={(e) => setWechat(e.target.value)} placeholder="我们要用它联系你" />
          </label>
          {err && <p className="text-sm font-semibold" style={{ color: "#F97028" }}>{err}</p>}
          <button
            onClick={confirm}
            disabled={startEnroll.isPending}
            className="font-display text-lg py-3.5 rounded-full disabled:opacity-50"
            style={{ background: "#F97028", color: "#FFFDF6" }}
          >
            {startEnroll.isPending ? "确认中…" : "确认并填写资料 →"}
          </button>
          <button onClick={onClose} className="text-sm font-semibold py-2" style={{ color: "#a3988a" }}>
            先不参加，继续看结果
          </button>
        </div>
      </div>
    </div>
  );
}
