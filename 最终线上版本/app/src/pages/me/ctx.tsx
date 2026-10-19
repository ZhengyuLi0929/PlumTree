// /me 子路由共享上下文（单独成文件避免 MeGate ↔ 子页面的循环引用）
import { Navigate, useOutletContext } from "react-router";
import type { MeData } from "./_shared";

export type MeCtx = { data: MeData; preview: boolean; beta: boolean; refetch: () => void };

export function useMe() {
  return useOutletContext<MeCtx>();
}

/** 非 beta 用户访问子路由 → 回到 /me（旧版单页） */
export function BetaOnly({ children }: { children: React.ReactNode }) {
  const { beta } = useMe();
  if (!beta) return <Navigate to="/me" replace />;
  return <>{children}</>;
}
