import { useEffect } from "react";
import { trpc } from "@/providers/trpc";

function todayKey() {
  const cst = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return cst.toISOString().slice(0, 10);
}

export function VisitTracker() {
  const track = trpc.responses.trackVisit.useMutation();

  useEffect(() => {
    const path = `${window.location.pathname}${window.location.search}`;
    if (path.startsWith("/admin") || path.startsWith("/stats")) return;
    const key = `tz_visit_${todayKey()}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    track.mutate({
      path,
      referrer: document.referrer,
      landing: window.location.href,
    });
    // 每个浏览器会话每天只记一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
