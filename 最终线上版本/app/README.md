# 同桌的TA（deskcupid.com）

人大附中校友恋爱匹配活动网站：恋爱人格测试引流 → 报名进匹配池 → 每周三空投一位对象 → 周三至周五小纸条传话 → 周末见面 → 周一回访。

## 技术栈

React 19 + Vite 7 + Tailwind（前端）｜ Hono + tRPC 11 + Drizzle ORM + MySQL 8（后端）｜ 单进程同时服务静态页与 API。

## 常用命令

```bash
npm run db:up          # 起本地 MySQL（docker，3307 端口）
npm run dev            # 开发服务器（默认 3000；被占用时 npm run dev -- --port 3100）
npm run check / build  # 类型检查 / 构建（vite build + esbuild 打包 api/boot.ts）
npm test               # vitest 单元测试
npm run test:bot       # 机器人全链路 mock（绑定→闲聊→需求抽取→传话限额→降级）
npm run test:matching  # 匹配算法 + 调度器注入时间全周期
npm run sandbox        # 命令行月老沙箱（真实 botBrain，不触网企业微信）
npm run sandbox:web    # 微信样式网页沙箱 http://127.0.0.1:4177/
npm start              # 生产模式（NODE_ENV=production node dist/boot.js）
```

## 架构

```
api/boot.ts            Hono 入口：/api/trpc/*（tRPC）｜ /api/wecom/callback（企微回调）｜
                       /api/sms/inbound（短信上行）｜ /api/photos/:file（用户照片）
api/responseRouter.ts  全部 tRPC 端点（测试提交/报名/会员登录/管理后台/统计导出）
api/lib/botBrain.ts    月老主流程：绑定→确认→回访→传话→闲聊（LLM）
api/lib/scheduler.ts   每周调度 tick：周三生成配对 → 周五确认短信 → 周六轮空 → 周一回访
api/lib/smsMatch.ts    短信侧匹配状态机（周三空投/小纸条/【匹配】【不匹配】）
api/lib/matching.ts    规则匹配 v1（硬雷区 + 官配加分 + 轮空优先 + 上周排除）
db/schema.ts + api/queries/connection.ts  表结构；ensureTable() 惰性建表/加列（只增不删）
```

## 触达通道（两条并存）

- **企业微信客服「月老」**：回调 + sync_msg 轮询收消息，send_msg 回复。闲聊走 DeepSeek。
- **短信**：报名手机号下发空投/小纸条/周五确认；上行回复进 `/api/sms/inbound`。通知模板单变量，正文整体放进变量。

## 会员页 /me

**入口**：主页欢迎页双入口——「开始测试」进测验流程；「我已报名，登录查看」进 /me 登录。测验结果页另有「保存结果」卡：姓名 + 手机号 + 验证码 + 勾选《隐私政策》→ `memberRegister` 创建/复用档案 → 进 /me（`profiles` 的 `birth_year`/`city`/`grad_class` 可空，进 /me 后再补全）。

**登录**（姓名 + 手机号 + 验证码；`otp_codes` 表，60s 重发 / 每小时 5 次）：
- 手机号有记录但姓名对不上 → 拒绝
- 姓名在册但没手机号（名单外四人）→ 任意手机号 + 验证码登录，并写入该手机号
- 姓名不在册 → 拒绝

开发模式（未配短信且非生产）`sendLoginCode` 返回 `devCode`，验证码直接显示在页面上。

**登录后**：
- 个人资料默认在编辑态，全部字段可改（含姓名/性别/出生年/手机号——改手机号会重签登录态）
- 照片墙最多 9 张（`data/photos/`；预览模式可本地预览不落库）
- MBTI 独立卡片：`src/data/mbti.ts` + `public/mbti/*.svg`，程序化形象 + 中文昵称 + ≤30 字爱情指南
- 人格维度条下方附含义解释

本地预览：`/me?preview=1`（仅 dev）。

## 关键环境变量

见 `.env.example`。不配 WECOM_* 机器人关闭；不配 LLM_* 闲聊用占位回复；不配短信则验证码与通知短信只打日志。开发模式（未配短信且非生产）也能测登录：`sendLoginCode` 返回 `devCode`，验证码直接显示在页面上。生产把变量写进服务器的 `/etc/tongzhuo/env`。

## 隐私与合规

- 报名须勾选《隐私政策》（/privacy），法定婚龄校验（男 22 / 女 20）
- 聊天记录与择偶需求字段级 AES-256-GCM 加密（FIELD_ENCRYPTION_KEY）
- 月老对话中真实姓名一律打码（maskName.ts），模型只见「对方」
- 后台写操作与对外消息全部落 audit_logs
