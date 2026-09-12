# 「同频」MVP 产品需求文档（PRD）
## V0.1 ｜ 交付开发版 ｜ 2026-08-26

> **文档目的**：自包含描述 MVP 全部需求，工程师（或 AI 编码工具）仅凭本文即可完成实现。
> **与完整版关系**：本文是《小程序产品需求文档PRD》的极简先行版；完整版中的认证、约见、反馈、活动、支付等体系在 MVP 验证达标后按第 13 章路径加回。

---

## 1. 文档信息

| 项 | 内容 |
|---|---|
| 产品名 | 同频（暂定名，全局使用占位符 `{{APP_NAME}}`） |
| 平台 | 微信小程序 |
| 版本范围 | **仅四大核心功能**：① AI 对话搜集信息 ② AI 明确择偶需求 ③ AI 匹配 ④ 每周空投对象 |
| 明确删除（本版不做） | 实名/人脸认证、校友认证、约见确认与打卡、双向反馈表、活动与支付、邀请体系、毕业/封禁体系、运营后台（仅需数据库控制台） |
| 技术栈（约定） | 微信原生小程序 + 微信云开发（云函数 Node.js + 云数据库 + 云存储）；AI 经云函数调用大模型 API（默认 Moonshot/Kimi，适配器封装可替换） |

## 2. 前端审美（Design Language）

> **一句话审美定义**：**OLED 深色基座上的「极光流体 × 液态玻璃」——以 Aurora Mesh Gradient（极光网格渐变）为环境光背景，Glassmorphism 2.0 / Liquid Glass（液态玻璃拟态）承载信息卡片，Spring Physics（弹簧物理动效）驱动所有转场，Kinetic Typography（动力学排版）点燃空投揭晓时刻，Generative Art（生成艺术）渲染每周匹配海报。**

具体执行规范（开发必须遵守）：

| 维度 | 规范 |
|---|---|
| 色彩基座 | Dark-mode-native 深色基座（`#0B0B12` 级近黑），OLED 省电且夜间使用友好；点缀色为极光双色（青紫 `#7C5CFF` → 品红 `#FF5CA8` 渐变） |
| 背景 | Aurora Mesh Gradient：2-3 个高斯模糊色团缓慢漂移（CSS/canvas 实现，blur 60-120px），为玻璃层提供折射素材 |
| 卡片 | Glassmorphism 2.0：`backdrop-filter: blur(12-20px)` + `rgba(255,255,255,0.06-0.10)` 填充 + 1px 半透明白边（20-40% 透明度）+ 内高光；模糊层全屏 ≤3 层以防掉帧 |
| 动效 | Spring Physics：所有转场/按钮用弹簧曲线（stiffness ≈ 170 / damping ≈ 26），禁用线性 easing；功能性微交互（Functional Micro-interactions）单次 ≤300ms；仅用 GPU 加速属性（transform/opacity） |
| 揭晓时刻 | Kinetic Typography：空投卡片落下时标题文字逐字弹入（字符级 spring stagger 30ms）；配合 Lottie 粒子礼花与触觉反馈（wx.vibrateShort） |
| 信息架构 | Bento Grid（便当格布局）：首页用不对称玻璃格承载倒计时/开关/历史空投 |
| 海报 | Generative Art Poster：canvas 程序化生成——双方特质关键词 + 流体渐变碰撞 + 噪点颗粒（grain overlay），每周视觉不重复 |
| 空间层级 | Spatial Layering：Z 轴纵深表达优先级——海报悬浮于玻璃卡片之上，投影随层级加深 |

## 3. 产品概述

### 3.1 一句话定义

聊 10 分钟，每周三 19:00 空投一个值得见的人。

### 3.2 核心闭环（开发视角）

```
微信一键登录 → AI 对话采集（约10分钟）→ AI 生成「择偶需求卡」→ 用户确认
→ 进入空投池 → [每周三 00:00 定时跑批生成匹配] → [19:00 订阅消息推送]
→ 用户查看空投（48h 内）→ 感兴趣/跳过 → 双向感兴趣 → 解锁微信号 + AI 建议的第一次见面
→ 空投结束后：一句话反馈「这次哪里不对？」回流偏好模型
```

### 3.3 MVP 边界说明（合规提示）

本版无实名认证，**不得申请"社交-婚恋"类目**；建议以"效率/社交工具"类目或体验版内测形式发布，对外叙事为"AI 社交实验"。收集微信号需页面明示用途；全部 UGC 文本过 `security.msgSecCheck`。

---

## 4. 角色与全局状态

### 4.1 角色

| 角色 | 说明 |
|---|---|
| 游客 | 仅可见登录页与说明页 |
| 建档中用户 | 已登录，未完成需求卡确认 |
| 池内用户（active） | 已确认需求卡，参与每周空投 |
| 暂停用户（paused） | 手动关闭"本周参加" |

### 4.2 用户状态机（`users.status`）

```
onboarding ──需求卡确认──▶ active ⇄ paused
```

### 4.3 空投状态机（`matches.status`）

```
created(周三00:00) ─▶ delivered(19:00推送) ─▶ mutual(双方感兴趣→解锁)
delivered ─▶ expired(48h超时/任一方跳过)
```

### 4.4 每周节拍（服务器时间，东八区）

| 时间 | 事件 |
|---|---|
| 每周二 23:59 | 空投池锁定（`active` 且 `participate_this_week=true`） |
| 每周三 00:00-18:30 | 定时触发器跑批匹配、生成海报与解读文案 |
| 每周三 19:00 | 订阅消息推送"你的空投已着陆" |
| 推送后 48h | 感兴趣/跳过窗口期 |

---

## 5. 页面详述（共 6 页）

> 目录结构：`pages/launch`、`pages/login`、`pages/onboarding-chat`、`pages/preference-card`、`pages/home`、`pages/drop-detail`。所有列表页下拉刷新；所有按钮防重复点击。

### 5.1 启动页 `pages/launch`

- 【元素】极光背景 + Logo + 加载动画。
- 【逻辑】调 `auth.login` → 按 `users.status` 路由：未注册→login；onboarding→onboarding-chat（断点续聊）；active/paused→home。
- 【边界】网络失败显示重试；3 秒超时保底进 login。

### 5.2 登录页 `pages/login`

- 【元素】一句话价值主张"每周三晚 7 点，空投一个值得见的人"；【微信一键登录】；用户协议+隐私政策勾选（默认不勾）；底部"先了解一下"说明页入口（静态页：四步流程图）。
- 【逻辑】勾选后 `wx.login` 完成静默注册（**仅取 openid，不强制手机号/头像昵称**）→ 跳转 onboarding-chat。
- 【边界】未勾选点击 → toast"请先阅读并同意协议"。

### 5.3 AI 对话采集页 `pages/onboarding-chat`（核心页 1）

- 【元素】聊天气泡（AI 左/用户右）；顶部极简进度环（不显示具体轮数，只显示"了解程度"百分比）；输入区支持文字与语音（同声传译插件转文字）；【稍后再聊】退出按钮。
- 【对话脚本（服务端 Prompt 管理，3 幕，总时长 ≤10 分钟）】
  1. 破冰与基础（昵称、性别、年龄段、城市、性取向）；
  2. 生活方式与性格（周末画像、社交偏好、作息、兴趣及其背后动机——AI 必须追问至少 1 次"为什么"）；
  3. 情感偏好（欣赏什么样的人、不能接受的点、理想相处模式）。
- 【逻辑】每轮：`aiChat.chat(sessionId, message)` → 模型返回（V0.1 用一次性返回，不做流式）；对话存 `chat_sessions`；信息完整度 ≥阈值后 AI 自然收口并触发 `aiChat.finalize`。
- 【边界】内容安全拦截涉政涉黄辱骂并重定向话题；AI 超时 10 秒 → 兜底话术"刚刚走神了，你接着说？"；断线重连恢复会话；对话中绝不出现"匹配""打分"等机械词汇。

### 5.4 择偶需求卡页 `pages/preference-card`（核心页 2）

- 【元素】玻璃拟态卡片，Bento 分区：① 硬条件区（年龄段/城市/身高区间，可编辑控件）；② 软偏好标签云（可点选删除、可添加）；③ 一句话画像（AI 生成，"重新生成"按钮）；④ 【对，就是这样】主按钮。
- 【逻辑】确认 → `users.status=active`，写 `profiles`；修改标签 → 调 `aiChat.revise` 实时改写画像。
- 【边界】画像禁用夸张词库（"命中注定/灵魂伴侣/百分百"）；修改次数不限。

### 5.5 首页 `pages/home`

- 【元素】Bento Grid 玻璃格：① 大格：倒计时"距本周空投还有 X 天 X 小时"（极光渐变数字）+ "本周参加"开关；② 小格：历史空投入口（列表：过往结果，解锁的显示对方昵称）；③ 小格：设置入口（订阅消息管理、注销账号、隐私政策）。
- 【逻辑】开关状态在周二 23:59 锁定；首次进入引导订阅消息授权（一次性订阅）。
- 【边界】无匹配周（池内异性不足）→ 大格显示"本周池子还在扩容，下周三见"+ 提前推送告知。

### 5.6 空投详情页 `pages/drop-detail`（核心页 3）

- 【元素】① 揭晓动效区：海报从顶部弹簧落下（Kinetic Typography 逐字弹入标题"你的空投已着陆"+ Lottie 粒子 + 短震动）；② Generative Art 匹配海报（canvas 生成：双方特质关键词 + 流体渐变碰撞 + 噪点颗粒）；③ 对方卡片：昵称、年龄段、城市、3 个特质标签、AI 解读"为什么是你们"（≤100 字）；④ 【感兴趣 💗】【跳过 ✕】+ 48h 倒计时。
- 【逻辑】感兴趣 → `matchAction.interest`；双方都感兴趣 → 页面 Spring 翻转为"你们都想认识对方 🎉"，展示双方微信号（各自在需求卡确认后自愿填写，未填者此时补填）+【一键复制】+「AI 建议的第一次见面」卡片；跳过 → 记录原因标签（忙/没感觉/条件不符）回流偏好模型。**空投结束后（跳过/超时/解锁 24h 后）推送单问题微反馈**："这次哪里不对？"（可选标签：年龄不符/城市太远/气质不合/没眼缘/其他，可跳过不答），答案经 `matchAction.microFeedback` 写入 `profiles.behavior_signal`。
- 【边界】单方感兴趣对方不可见（互盲）；超时自动 expired；海报**不含**对方任何可识别信息，防止截图外泄；见面建议卡为纯建议（不接地图选点、不产生任何状态流转），微反馈最多推送 1 次、不答无惩罚。

---

## 6. 数据库设计（云数据库，4 个集合）

### 6.1 `users`

| 字段 | 类型 | 说明 |
|---|---|---|
| nickname | string | 用户自取昵称（非微信昵称） |
| gender / orientation | enum | 性别 / 取向 |
| age_range / city | string | 年龄段 / 城市 |
| wechat_id | string(可空) | 解锁用微信号（加密存储） |
| status | enum | onboarding/active/paused |
| participate_this_week | bool | 默认 true |
| created_at / updated_at | timestamp | |

### 6.2 `profiles`（AI 建档产物）

| 字段 | 类型 | 说明 |
|---|---|---|
| user_id | string | |
| traits | array | [{key, weight}] 特质标签 |
| hard_prefs | object | {age_min, age_max, cities[], height_min, height_max} |
| soft_prefs | array | 软偏好标签 |
| dealbreakers | array | 一票否决项 |
| persona_line | string | 一句话画像 |
| embedding | array(number) | 人格向量（embedding 接口生成） |
| behavior_signal | object | 感兴趣/跳过历史统计（回流修正） |

### 6.3 `chat_sessions`

| user_id | messages[{role, content, ts}] | act(1-3) | finished | finalized_profile_id |

### 6.4 `matches`

| 字段 | 类型 | 说明 |
|---|---|---|
| week_id | string | 如 2026-W35 |
| user_a / user_b | string | user_a < user_b 防重复 |
| match_score | number | 0-100 |
| reason_text | string | "为什么是你们" |
| poster_file_id | string | 海报（云存储） |
| meet_suggestion | object | Planning Agent 产出：{venue_type, time_slots[], safety_text} 第一次见面建议 |
| status | enum | created/delivered/mutual/expired |
| a_action / b_action | enum | pending/interested/skipped/timeout |
| skip_reason_a / b | string | |
| deadline | timestamp | 推送+48h |

---

## 7. 云函数 / API 清单

> 统一约定：返回 `{code:0, data} | {code:非0, msg}`；写操作幂等（客户端带 requestId）；鉴权取 openid 映射 userId。

| 云函数 | action | 入参 | 返回 | 说明 |
|---|---|---|---|---|
| `auth` | login | code | {userId, status, isNew} | wx.login 换 openid，Upsert |
| `aiChat` | start | {} | {sessionId, firstMsg} | 开启对话 |
| `aiChat` | chat | {sessionId, message, audioFileId?} | {reply, progress} | 单轮对话；语音转文字；msgSecCheck；10s 兜底 |
| `aiChat` | finalize | {sessionId} | {profile} | 生成需求卡+向量 |
| `aiChat` | revise | {profileId, addTags[], removeTags[], hardPrefs} | {personaLine} | 标签修改后重写画像 |
| `matchEngine` | —（定时触发） | — | — | 每周三 00:00 跑批，见第 8 章 |
| `matchAction` | getCurrent | {} | {match?} | 首页/空投页数据源 |
| `matchAction` | interest | {matchId, wechatId?} | {mutual, wechatIds?} | 幂等；双向→返回双方微信号 |
| `matchAction` | skip | {matchId, reason} | {} | 记录原因回流 |
| `notify` | sendSubscribe | {userId, templateId, data} | — | 订阅消息；失败落库补偿 |

---

## 8. 匹配引擎（多 Agent 流水线）

> 参照 Ditto 的多 Agent 架构。MVP 阶段不建独立服务——四个 Agent 以**规则代码 + 链式 Prompt**在 `matchEngine` 云函数内实现，语义分层保持一致；V2 再将 Simulation Agent 拆分为重模拟服务。

### 8.0 Agent 分工

| Agent | 职责 | MVP 实现 |
|---|---|---|
| Analysis Agent | 从对话抽取特质、偏好，生成 embedding | 已由 `aiChat.finalize` 完成 |
| Matchmaking Agent | 硬过滤 + 加权评分 + 配对求解 | 规则代码（8.1-8.3） |
| Simulation Agent | 对候选对模拟互动，评估"vibe"契合 | 简化版：对每用户 Top-5 候选对各跑 1 次两轮轻量模拟对话，输出流畅度/情绪对齐评分计入 8.2；V2 扩展为重模拟（参照 Ditto 单用户千次级模拟） |
| Planning Agent | 生成匹配解读、海报文案、第一次见面建议 | 生成式 Prompt（8.4） |

### 8.1 候选池过滤（硬性）

1. `status=active` 且 `participate_this_week=true`；
2. 同城；3. 取向匹配；4. 双向满足对方 `hard_prefs` 与 `dealbreakers`；5. 排除历史匹配过的组合。

### 8.2 评分（0-100）

| 维度 | 权重 | 计算 |
|---|---|---|
| 人格契合 | 35% | embedding 余弦相似度，0.6-0.85 区间得分最高 |
| 模拟对话契合 | 25% | Simulation Agent 对 Top-5 候选对的轻量模拟评分（流畅度+情绪对齐） |
| 软偏好交集 | 20% | soft_prefs 标签交集率 |
| 行为修正 | 15% | behavior_signal（跳过原因+单问微反馈的反向修正） |
| 轮候补偿 | 5% | 连续未获匹配者优先（防长尾被遗忘） |

### 8.3 配对求解

按匹配分降序贪心配对，冲突取全局总分更高组合；池内奇数/比例失衡时，未配对用户记轮候优先权，并推送"本周池子还在扩容"。

### 8.4 内容生成

每对产出调大模型生成 `reason_text`（≤100 字，基于特质交集，禁用夸张词库）+ canvas 服务端生成海报存云存储。

---

## 9. 微信能力接入

| 能力 | 用途 | 备注 |
|---|---|---|
| wx.login | 静默登录 | 唯一身份来源 |
| 订阅消息 ×2 | ①空投到达 ②双向奔赴通知 | 一次性订阅，关键节点重新引导 |
| security.msgSecCheck | 全部 UGC（对话、昵称、跳过原因） | 同步检测 |
| 同声传译插件 | 语音输入转文字 | 官方插件 |
| wx.vibrateShort | 空投揭晓/双向奔赴触觉反馈 | |
| 大模型 API | 对话/需求卡/解读 | 已备案模型，密钥存云函数环境变量 |

---

## 10. 非功能需求

- **性能**：首屏 ≤1.5s（4G）；AI 单轮 P95 ≤4s；1 万池跑批 ≤10 分钟；模糊层 ≤3 层防掉帧；
- **隐私**：最小化采集（不碰身份证/人脸/学历）；微信号加密存储；注销即删（无冷静期，二次确认即可）；隐私政策页随首版上线；
- **安全**：云数据库"仅创建者可读写"，跨用户读取必须经云函数；一 openid 一号；
- **合规红线**：无实名体系，不碰"婚恋"宣传话术与类目；对外叙事"AI 社交实验"。

## 11. 埋点

| 事件 | 参数 |
|---|---|
| chat_progress | act, duration |
| preference_confirm | 一次确认 / 修改后确认 |
| drop_view / interest / skip | match_id, score, reason |
| mutual_unlock | week_id |

北极星指标：**空投感兴趣率**（interest/delivered，目标 ≥40%）与**双向率**（mutual/delivered，目标 ≥15%）。

## 12. 验收标准（UAT Checklist）

- [ ] 登录到进入对话 ≤2 次点击、30 秒内开始聊天；
- [ ] AI 对话 3 幕走完出需求卡；中途退出可续聊；信息不足不出卡；
- [ ] 需求卡标签增删后画像实时改写；夸张词库不出现于任何 AI 文案；
- [ ] 测试环境"模拟周三"开关可触发跑批与 19:00 推送；
- [ ] 感兴趣互盲：单方操作对方不可见；双向后微信号正确解锁，且展示「AI 建议的第一次见面」卡片（2 个时段+公共场所类型，只读无状态流转）；
- [ ] 空投结束后单问题微反馈最多推送 1 次，答案正确写入 behavior_signal 并影响下周评分；
- [ ] 超时/跳过/无匹配周三条路径文案与状态正确；
- [ ] 审美走查：极光背景漂移流畅、玻璃卡片折射正确、揭晓动效 spring 无掉帧（中端机实测）；
- [ ] 涉政涉黄辱骂测试样本全部拦截；
- [ ] 注销后数据库无残留个人数据。

## 13. 从 MVP 到完整版的演进路径

| 触发条件 | 动作 |
|---|---|
| 感兴趣率 ≥40% 且双向率 ≥15% 连续 2 周 | 启动完整版《小程序产品需求文档PRD》：加回实名+校友认证、约见、反馈体系 |
| 池内单向性别积压 >30% | 先于完整版上线邀请机制控比例 |
| 出现骚扰/诈骗投诉 | 立即加回举报入口（MVP 期间人工监控数据库） |

---

## 附录：审美参考来源

[^1^]: [Glassmorphism UI Template: Complete Guide (2026)](https://proofmatcher.com/blogs/glassmorphism-ui-template-guide-2026)
[^2^]: [UI/UX Design Trends 2026: Spatial UI, Glassmorphism 2.0 & The End of Flat Design](https://superfiles.in/ui-ux-design-trends-2026-spatial-glassmorphism.php)
[^3^]: [UI Design Trends 2026: Bento Grids, Glassmorphism, and What's Actually Shipping](https://rajeshrnair.com/blog/design/ui-ux/ui-design-trends-2026-bento-grids-glassmorphism.html)
[^4^]: [20 UI Design Trends in 2026 That Boost User Experience](https://stepsharp.com/embracing-the-latest-ui-trends-for-an-enhanced-user-experience/)
[^5^]: [UX/UI trends shaping digital products in 2026](https://www.stan.vision/journal/ux-ui-trends-shaping-digital-products)
