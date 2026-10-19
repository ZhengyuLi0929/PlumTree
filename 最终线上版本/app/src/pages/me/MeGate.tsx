// /me 布局：登录门禁 + 五个平行子路由（本周同桌的TA / 我的信箱 / 本周约会倾向 / 我的人格 / 修改密码）
// 「我的信箱」带未读通知徽标；进入该路由即标记已读。
import { useEffect } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router";
import { trpc } from "@/providers/trpc";
import { ChangePasswordCard, DatePrefsCard, Login, PhotoWall, ProfileCard, Shell, type MeData } from "./_shared";
import { PersonaCards } from "./MePersona";
import { useMe, type MeCtx } from "./ctx";

export { useMe } from "./ctx";

const TABS = [
  ["match", "本周同桌的TA"],
  ["chat", "我的信箱"],
  ["date", "本周约会倾向"],
  ["persona", "我的人格"],
  ["password", "修改密码"],
] as const;

export default function MeGate() {
  const location = useLocation();
  // 预览口令：/me?preview=142857（线上也可查看；写库只在本地开发环境生效）
  const preview = new URLSearchParams(window.location.search).get("preview") === "142857";
  // 灰度开关：?beta=1 开启并在本浏览器记住，?beta=0 关闭
  const q = new URLSearchParams(window.location.search);
  if (q.get("beta") === "1") sessionStorage.setItem("tz_beta", "1");
  if (q.get("beta") === "0") sessionStorage.removeItem("tz_beta");
  const beta = sessionStorage.getItem("tz_beta") === "1";
  // 未登录/登录过期的失败立即落到登录页，不再白等一个 retry 周期
  const me = trpc.responses.memberMe.useQuery(preview ? { preview: true } : undefined, {
    retry: preview
      ? 0
      : (failureCount, error) => {
          if (error.message.includes("登录") || error.data?.code === "UNAUTHORIZED") return false;
          return failureCount < 1;
        },
  });

  const utils = trpc.useUtils();
  const logout = trpc.responses.memberLogout.useMutation({ onSuccess: () => void me.refetch() });
  // 「我的信箱」未读徽标（预览模式不查）
  const notify = trpc.responses.memberNotifications.useQuery(undefined, {
    enabled: beta && !preview && Boolean(me.data),
    refetchInterval: 15000,
  });
  const markRead = trpc.responses.memberMarkRead.useMutation({
    onSuccess: () => void utils.responses.memberNotifications.invalidate(),
  });
  const onChatTab = location.pathname === "/me/chat";
  useEffect(() => {
    if (onChatTab && beta && !preview && me.data) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChatTab, beta, preview, Boolean(me.data)]);
  const unread = notify.data?.unread ?? 0;

  if (me.isLoading) {
    return <Shell><p className="text-center py-20 font-display" style={{ color: "#a3988a" }}>加载中…</p></Shell>;
  }
  if (me.error || !me.data) return <Login onOk={() => void me.refetch()} />;
  const data = me.data as MeData;
  const ctx: MeCtx = { data, preview, beta, refetch: () => void me.refetch() };

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

      {beta && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {TABS.filter(([k]) => k !== "password" || !preview).map(([k, label]) => (
            <NavLink
              key={k}
              to={{ pathname: `/me/${k}`, search: location.search }}
              className="font-display text-sm px-5 py-2.5 rounded-full transition-all relative"
              style={({ isActive }) => ({
                background: isActive ? "#F97028" : "#FFFDF6",
                color: isActive ? "#FFFDF6" : "#7a7060",
                border: "2px solid",
                borderColor: isActive ? "#F97028" : "#E8DCC0",
              })}
            >
              {label}
              {/* 未读通知徽标 */}
              {k === "chat" && unread > 0 && (
                <span
                  className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full text-[11px] font-bold flex items-center justify-center"
                  style={{ background: "#e03131", color: "#FFFDF6" }}
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      )}

      <Outlet context={ctx} />
    </Shell>
  );
}

/** /me 索引：beta 用户跳到本周同桌的TA；非 beta 保持旧版单页 */
export function MeIndex() {
  const { data, preview, beta } = useMe();
  if (beta) return <Navigate to={{ pathname: "/me/match", search: window.location.search }} replace />;
  const p = data.profile;
  return (
    <>
      <PersonaCards data={data} />
      <PhotoWall photos={data.photos ?? []} preview={preview} />
      <ProfileCard p={p} preview={preview} />
      <DatePrefsCard raw={p.datePrefs} participate={p.participate === true} preview={preview} />
      {!preview && <ChangePasswordCard />}
    </>
  );
}
