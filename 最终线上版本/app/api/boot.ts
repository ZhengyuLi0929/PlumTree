import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env, wecomConfigured } from "./lib/env";
import { wecomRouter } from "./wecomRouter";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.route("/api/wecom", wecomRouter);
// 用户照片（模糊文件名；只读）
app.get("/api/photos/:file", async (c) => {
  const { readPhoto } = await import("./lib/photos");
  const hit = readPhoto(c.req.param("file"));
  if (!hit) return c.json({ error: "Not Found" }, 404);
  return c.body(new Uint8Array(hit.buf), 200, { "Content-Type": hit.mime, "Cache-Control": "public, max-age=31536000, immutable" });
});
app.post("/api/sms/inbound", async (c) => {
  // 兼容两种形态：自建联调 {from,text}；腾讯云上行回调 {mobile,text,extend,...}
  const body = (await c.req.json().catch(() => ({}))) as { from?: string; mobile?: string; text?: string; dayKey?: string };
  const from = body.from ?? body.mobile;
  const text = body.text;
  if (!from || !text) return c.json({ error: "from/mobile and text are required" }, 400);
  const { receiveInboundSms } = await import("./lib/smsMatch");
  const result = await receiveInboundSms({
    from,
    text,
    dayKey: env.isProduction ? undefined : body.dayKey,
  });
  return c.json(result, result.ok ? 200 : 404);
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  // 微信客服消息轮询（配置了企业微信才启动；回调事件也会触发 sync）
  if (wecomConfigured()) {
    const { syncAndProcess } = await import("./lib/botBrain");
    setInterval(() => {
      void syncAndProcess().catch((err) => console.error("[wecom] poll:", err));
    }, 30_000);
  }

  // 每周节奏调度器（有数据库才启动）
  if (env.databaseUrl) {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
