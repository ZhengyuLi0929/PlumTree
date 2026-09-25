// 页脚多通道入口：公众号 / 小程序（环境变量驱动，未配置则不渲染）
const MP_URL = import.meta.env.VITE_MP_ACCOUNT_URL as string | undefined;
const MINI_URL = import.meta.env.VITE_MINIPROGRAM_URL as string | undefined;

export function SiteFooter() {
  if (!MP_URL && !MINI_URL) return null;
  return (
    <div className="text-center mt-10 pb-4">
      <p className="text-xs mb-2" style={{ color: "#a3988a" }}>更多入口</p>
      <div className="flex justify-center gap-3">
        {MP_URL && (
          <a href={MP_URL} target="_blank" rel="noreferrer"
            className="text-xs font-semibold px-4 py-2 rounded-full"
            style={{ background: "#FFFDF6", color: "#7a7060", border: "1px solid #E8DCC0" }}>
            微信公众号
          </a>
        )}
        {MINI_URL && (
          <a href={MINI_URL} target="_blank" rel="noreferrer"
            className="text-xs font-semibold px-4 py-2 rounded-full"
            style={{ background: "#FFFDF6", color: "#7a7060", border: "1px solid #E8DCC0" }}>
            小程序
          </a>
        )}
      </div>
    </div>
  );
}
