// /admin 布局：管理员门禁 + 子路由导航（每个 tab 一条路由）
import { Navigate, NavLink, Outlet } from "react-router";
import { trpc } from "@/providers/trpc";
import { AdminLogin, Shell } from "./_shared";

const TABS = [
  ["match", "手动匹配"],
  ["dsmatch", "AI匹配"],
  ["airdrop", "匹配结果"],
  ["merchant", "商户核销"],
  ["feedback", "改进意见"],
  ["ops", "运营指标"],
  ["visits", "访问统计"],
] as const;

export default function AdminGate() {
  const me = trpc.responses.adminMe.useQuery();
  const logout = trpc.responses.adminLogout.useMutation();

  if (me.isLoading) {
    return <Shell><p className="text-center py-20 font-display" style={{ color: "#a3988a" }}>加载中…</p></Shell>;
  }
  if (me.error) return <AdminLogin onOk={() => void me.refetch()} />;

  return (
    <Shell>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="font-display text-2xl md:text-3xl" style={{ color: "#121212" }}>匹配后台</h1>
        <div className="flex items-center gap-2">
          <a href="/stats-v3" className="font-display text-sm px-4 py-2 rounded-full" style={{ background: "#F3ECD2", color: "#7a7060" }}>
            题库统计
          </a>
          <button
            onClick={() => logout.mutate(undefined, { onSuccess: () => { sessionStorage.removeItem("adminToken"); void me.refetch(); } })}
            className="font-display text-sm px-4 py-2 rounded-full"
            style={{ background: "#FFFDF6", color: "#7a7060" }}
          >
            退出
          </button>
        </div>
      </div>
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map(([k, label]) => (
          <NavLink
            key={k}
            to={`/admin/${k}`}
            className="font-display text-sm px-5 py-2.5 rounded-full"
            style={({ isActive }) => ({
              background: isActive ? "#F97028" : "#FFFDF6",
              color: isActive ? "#FFFDF6" : "#7a7060",
            })}
          >
            {label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </Shell>
  );
}

/** /admin 索引 → 手动匹配 */
export function AdminIndex() {
  return <Navigate to="/admin/match" replace />;
}
