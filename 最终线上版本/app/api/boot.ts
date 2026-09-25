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
