# 「同频」微信小程序产品需求文档（PRD）
## V1.0 ｜ 交付开发版 ｜ 2026-08-26

> **文档目的**：本文档自包含地描述 V1.0 的完整需求，工程师（或 AI 编码工具）仅依据本文档即可完成实现，无需另行询问产品细节。
> **配套文档**：《商业计划书》《用户Roadmap》（背景与指标口径以本文为准）。

---

## 1. 文档信息

| 项 | 内容 |
|---|---|
| 产品名 | 同频（暂定名，全局使用占位符 `{{APP_NAME}}` 便于替换） |
| 平台 | 微信小程序（社交-婚恋类目） |
| 版本范围 | V1.0 = Phase 1（认证 + AI 建档 + 周匹配 + 约见 + 反馈 + 活动 + 邀请） |
| 非目标（V1.0 不做） | 会员付费与订阅、1v1 人工红娘工作台、对赌产品、情侣空间、跨城匹配（V2+，见第 16 章） |
| 技术栈（约定） | 微信原生小程序（WXML/WXSS/JS/TS）+ 微信云开发（云函数 Node.js + 云数据库 + 云存储）；AI 能力通过云函数调用已备案大模型 API |

---

## 2. 产品概述

### 2.1 一句话定义

面向 985/211 校友与 QS100 海归（18 岁以上、已毕业）的严肃恋爱小程序：三重认证建立信任，AI 对话建立档案，**每周三 19:00 推送 1 个匹配**，双方接受后代为协调线下约见，见面后双向反馈持续优化匹配。

### 2.2 核心闭环（开发视角）

```
登录 → 实名认证(人脸) → 校友认证 → AI建档对话 → 进入匹配池
→ [每周三19:00定时任务] 生成匹配 → 双方48h内接受/婉拒
→ 双方接受 → 1v1排他 → 约见时间地点确认 → 到场打卡
→ 24h内双向反馈 → 解除排他/继续发展 → 下周新一轮
```

### 2.3 设计红线（必须实现，不可妥协）

1. 仅服务 18 岁以上成年人；校友认证必须校验"已毕业"（入学年份+学制推算或证明材料）；
2. 身份证、人脸、学历属敏感个人信息：采集前必须有**单独弹窗告知 + 单独同意**（非一揽子授权）；
3. 用户资料**仅对当前匹配对象可见**，产品内不存在任何公开信息流/广场/搜索他人功能；
4. 放鸽子经核实 → 永久封禁；骚扰举报查实 → 永久封禁；
5. 所有用户生成文本内容（对话、反馈、昵称）必须经过内容安全检测（`security.msgSecCheck`）。

---

## 3. 角色与权限

| 角色 | 说明 | 权限 |
|---|---|---|
| 游客 | 未登录 | 仅可见启动页/登录页/活动预告落地页 |
| 注册用户 | 已登录未完成认证 | 可进入认证流程，不可见任何他人信息 |
| 认证用户 | 三重认证通过且建档评分 ≥70 | 全部 C 端功能 |
| 排他中用户 | 与对方互相接受匹配 | 本周内不再收到新匹配 |
| 毕业用户 | 标记确定关系 | 停止匹配，保留纪念页与邀请权 |
| 封禁用户 | 违规 | 登录后仅见封禁告知页与申诉入口 |
| 运营管理员 | 内部 | 运营后台全部功能（第 13 章） |

---

## 4. 技术架构

### 4.1 总体结构

```
┌─────────────┐     ┌──────────────────────────────┐     ┌──────────────┐
│  微信小程序   │────▶│        微信云开发               │────▶│ 大模型API     │
│  (原生框架)   │     │  云函数(Node.js) / 云数据库      │     │ (已备案模型)  │
└─────────────┘     │  云存储(照片) / 定时触发器        │     └──────────────┘
                    └──────────────┬───────────────────┘
                                   │              ┌──────┴───────┐
                                   ▼              ▼ 微信支付      ▼ 微信人脸核身/内容安全
                              运营后台(Web, 简版)
```

### 4.2 小程序目录结构（约定）

```
miniprogram/
├── app.js / app.json / app.wxss
├── pages/
│   ├── launch/            # 启动页
│   ├── login/             # 登录页
│   ├── verify-realname/   # 实名认证
│   ├── verify-alumni/     # 校友认证
│   ├── onboarding-chat/   # AI建档对话
│   ├── profile-card/      # 我的人格速写（建档结果确认）
│   ├── home/              # 首页（本周匹配状态）
│   ├── match-detail/      # 匹配详情+海报
│   ├── date-plan/         # 约见确认
│   ├── feedback/          # 约会反馈
│   ├── events/            # 活动列表
│   ├── event-detail/      # 活动详情+购票
│   ├── messages/          # 消息中心
│   ├── invite/            # 邀请好友
│   ├── memory/            # 毕业纪念页
│   ├── banned/            # 封禁告知页
│   └── profile/           # 个人中心
├── components/            # 海报canvas组件、对话气泡、匹配卡片、倒计时等
└── utils/                 # 请求封装、状态机、埋点
cloudfunctions/
├── auth/                  # 登录、认证相关
├── aiChat/                # AI建档对话
├── matchEngine/           # 匹配生成（定时触发器）
├── matchAction/           # 接受/婉拒/确认约见
├── feedback/              # 反馈提交与意向互盲解锁
├── events/                # 活动与订单
├── invite/                # 邀请码
├── admin/                 # 运营后台接口
└── notify/                # 订阅消息推送
```

### 4.3 AI 接入约定

- AI 建档对话、人格速写生成、匹配解释文案、匹配海报文案：统一由云函数 `aiChat` / `matchEngine` 调用**已在中国完成备案的大模型 API**（默认 Moonshot/Kimi API，接口层做适配器封装，可替换供应商）；
- 模型调用必须服务端发起，密钥存云函数环境变量，严禁下发到小程序端；
- 所有 AI 输出落库前过内容安全检测；AI 回复超时 10 秒降级为预设兜底话术。

---

## 5. 全局规范

### 5.1 导航

- 底部 TabBar（仅认证用户可见完整版）4 个 Tab：**首页 / 活动 / 消息 / 我的**；
- 未完成认证用户登录后强制进入认证流程页（不可切 Tab）。

### 5.2 用户主状态机（全局，存 `users.status`）

```
registered ──实名通过──▶ realnamed ──校友通过──▶ verified
verified ──建档≥70分──▶ active（匹配池）
active ──互相接受──▶ exclusive（排他中）──反馈完成/匹配结束──▶ active
active/exclusive ──确定关系──▶ graduated
任意状态 ──违规──▶ banned（终态，仅申诉）
```

### 5.3 每周节拍（服务器时间，东八区）

| 时间 | 事件 |
|---|---|
| 每周二 23:59 | 本周匹配池锁定（`active` 且 `participate_this_week=true` 的用户进入候选） |
| 每周三 00:00-18:30 | 定时触发器运行匹配引擎，生成 `matches` |
| 每周三 19:00 | 订阅消息推送"你的本周匹配已到达" |
| 匹配生成后 48h | 双方接受窗口期，超时匹配失效 |
| 见面后 24h | 反馈窗口开启，推送反馈提醒 |

---

## 6. 页面详述

> 每页按【目标】【入口】【页面元素】【交互逻辑】【边界与异常】描述。所有列表页下拉刷新；所有表单防重复提交。

### 6.1 启动页 `pages/launch`

- 【目标】品牌露出 + 静默登录态检查路由分发。
- 【元素】Logo、`{{APP_NAME}}`、Slogan"你的朋友的朋友，值得你见一面"、加载动画。
- 【逻辑】调用 `auth.login`（wx.login 换 openid）→ 按 `users.status` 路由：未注册→登录页；未认证→认证流程；`active`→首页；`banned`→封禁页；`graduated`→首页（毕业形态）。
- 【边界】网络失败：显示重试按钮；3 秒超时保底进登录页。

### 6.2 登录页 `pages/login`

- 【元素】品牌区；"已有 N 位校友加入"（实时数字）；【微信一键登录】按钮；隐私政策与用户协议勾选框（默认不勾选）；"仅想看看"入口（游客模式，只读活动预告）。
- 【逻辑】① 必须勾选协议才能登录（未勾选点击时 toast"请先阅读并同意协议"）；② `wx.login` + `getPhoneNumber` 获取手机号（需用户触发 button）；③ 登录成功写 `users` 记录（status=registered）→ 跳转实名认证。
- 【边界】用户拒绝手机号授权：允许跳过但 toast 提示"约见确认需要手机号"，72h 内再次提醒。

### 6.3 实名认证页 `pages/verify-realname`

- 【目标】完成姓名+身份证+人脸活体核验（敏感信息单独同意）。
- 【元素】分步表单：Step1 姓名+身份证号（输入时前端校验身份证校验位）；Step2 **敏感信息单独告知弹窗**（采集目的、存储方式、保存期限、第三方核验机构，【同意并继续】【拒绝】）；Step3 调起人脸核身。
- 【逻辑】同意后人脸核身（微信人脸核身接口或合规第三方，封装在云函数 `auth.realnameVerify`）；核验通过→`users.status=realnamed`；拒绝→停留在本页并说明"实名认证是安全保障的必要条件，拒绝将无法继续使用"。
- 【边界】身份证号查重（一证一号）；未满 18 岁直接拦截并展示红线提示；核验失败可重试 3 次，超过转人工审核队列。

### 6.4 校友认证页 `pages/verify-alumni`

- 【目标】验证校友身份与"已毕业"状态。
- 【元素】① 选择认证路径：A. 邀请码直通（被邀请人）B. 学历材料认证；② 学校选择（V1 白名单：人大附中校友、清北人复交等，后台可配）；③ 届别/入学年份选择；④ 材料上传（毕业证/学信网截图/校友会证明，图片上传云存储）；⑤ 提交后状态页（审核中/通过/驳回原因）。
- 【逻辑】邀请码路径：校验 `invites` 有效且未用完 → 秒过；材料路径：进入人工审核队列（运营后台审核，SLA 24h），审核结果订阅消息通知。毕业校验：入学年份 + 学制推算毕业年份 ≤ 当前年份，否则拦截（在校高中生红线）。
- 【边界】图片需过内容安全（`security.imgSecCheck`）；被驳回可修改材料重新提交（最多 5 次）；白名单外学校提示"暂未开放，可登记开通提醒"。

### 6.5 AI 建档对话页 `pages/onboarding-chat`（核心页）

- 【目标】通过约 20 分钟 AI 对话完成人格与偏好建档。
- 【元素】聊天界面（AI 在左、用户在右气泡）；顶部进度条（当前第 X/约 25 轮）；输入区支持文字与语音（语音转文字，调用微信同声传译插件）；AI 头像与"红娘小频"人设名；【稍后再聊】按钮（保存进度退出）。
- 【对话脚本大纲（Prompt 由服务端管理，共 5 幕）】
  1. 破冰与基础（昵称、年龄、城市、职业/行业）；
  2. 生活方式与性格（作息、社交偏好、消费观、周末画像）；
  3. 情感观（过往经历抽象化、依恋模式、冲突处理方式、对婚姻的期待）；
  4. 择偶偏好（硬性条件：年龄段、城市、身高区间等；软性偏好：性格、价值观）；
  5. 审美校准（可选上传 1-3 张"心动类型"参考照，仅用于偏好建模，**绝不展示给任何用户**）。
- 【逻辑】每轮用户消息 → 云函数 `aiChat.chat(sessionId, message)` → 模型流式返回（websocket/轮询均可，V1 用轮询简化）；对话状态存 `chat_sessions`；完成 5 幕后调用 `aiChat.finalize` 生成：① 结构化档案 `profiles`（字段见 8.2）② 建档评分（完整度×真诚度，0-100）③ "我的人格速写"文案。
- 【边界】评分 <70：展示"还差一点点"页，指出缺失维度，引导补聊（不是拒绝，是补全）；涉政/涉黄/辱骂内容触发内容安全拦截并重定向话题；断网重连恢复会话；用户中途退出，下次进入从断点继续。

### 6.6 人格速写确认页 `pages/profile-card`

- 【元素】AI 生成的"我的人格速写"卡片（3-5 个特质标签 + 200 字描述 + 择偶偏好摘要）；【这就是我】【我想改改】按钮。
- 【逻辑】确认 → `users.status=active` 进入匹配池，展示"本周三 19:00 见"期待页 + 引导订阅消息授权（一次性订阅，模板见 10.3）；改改 → 回到对话对应幕修改。
- 【边界】用户可无限次修改直到满意；修改后重新计算评分，仍需 ≥70。

### 6.7 首页 `pages/home`（按状态自适应）

- 【状态 A：等待匹配（周三 19:00 前）】倒计时卡片"距本周匹配揭晓还有 X 天 X 小时"；"本周是否参加"开关（默认参加，周二 23:59 锁定）；下方：本周活动推荐 1-2 条 + 邀请好友入口。
- 【状态 B：匹配已到达】大字提示"你的本周匹配已到达"+【查看 TA】按钮 → 匹配详情页；48h 回应倒计时。
- 【状态 C：排他中】当前约见进度条（已接受→待确认时间地点→已确认→已完成）；对应操作入口。
- 【状态 D：待反馈】见面已完成 →【写下你的反馈】入口（带 24h 倒计时）。
- 【状态 E：毕业中】纪念页入口 + "帮朋友脱单"邀请卡片。
- 【边界】本周主动关闭参加开关：状态 A 显示"你已请假本周"，可重新开启（锁定前）。

### 6.8 匹配详情页 `pages/match-detail`

- 【目标】呈现匹配对象与"为什么匹配你"，驱动接受决策。
- 【元素】① 匹配海报（canvas 生成拼贴风：双方特质关键词、契合点插画、二维码占位）；② 对方名片：昵称、年龄段、城市、学校届别、3 个特质标签、**共同校友路径**（如"你们都是人大附中 2015 届"，若无则展示圈层路径）；③ "为什么匹配你"AI 解读报告（人格特质层面，300 字内）；④ 【接受，认识一下】【婉拒本周】按钮；48h 倒计时。
- 【逻辑】接受 → `matchAction.accept`（双方均接受 → 双方 `status=exclusive`，进入约见确认）；婉拒 → 记录原因（标签：忙/没感觉/条件不符/其他）→ 本周回到状态 A。
- 【边界】对方已婉拒：展示"TA 这周想休息一下"，本周匹配结束；任一方超时未回应：匹配失效，双方回到状态 A 并各记 1 次"无回应"（累计 3 次暂停推荐 2 周）；**本页禁止截屏分享他人信息**（海报中不含对方可识别信息，海报仅特质关键词）。

### 6.9 约见确认页 `pages/date-plan`

- 【元素】① 时间选择：系统给出 2 个候选时段（本周六/日下午场）；② 地点选择：系统推荐 3 个合作咖啡店（按双方位置中点计算，展示名称/地址/人均）；③ 双方选择状态（对方已选/待选）；④ 最终确认卡片（时间+地点+双方昵称）；⑤ 安全提示区（"请选白天公共场所""可将行程分享给紧急联系人"按钮）。
- 【逻辑】双方各自从候选中选择 → 取交集；无交集 → 各自重选 1 轮 → 仍无交集转运营人工协调（订阅消息通知）；确认后生成 `dates` 记录，双方订阅消息收到确认；见面前 2 小时推送"记得出发"提醒+到场打卡按钮（地理位置打卡，500m 范围内有效）。
- 【边界】任一方 24h 未选择 → 提醒 1 次 → 48h 未选择匹配失效并记"消极"1 次；**放鸽子判定**：对方到场打卡而己方未打卡且未提前 4 小时取消 → 进入举报核实流，核实成立永久封禁。

### 6.10 约会反馈页 `pages/feedback`

- 【元素】① 见面确认（"你们见面了吗"是/否）；② 愿意再见面？（愿意/不愿意，**双方互盲**）；③ 感受评分（1-5 星，维度：真诚度、匹配度、聊天体验）；④ 结构化标签（符合预期/不符合预期的点，多选）；⑤ 自由文本（选填，明确提示"对方不会看到你的文字内容"）。
- 【逻辑】双方均提交后：都愿意 → 解锁继续联系（交换微信/手机，双方确认后展示）；一方不愿意 → 礼貌告知"TA 想继续认识新朋友"，双方回到匹配池（解除排他）；反馈回流 `profiles.feedback_vector` 供匹配引擎迭代。
- 【边界】仅一方提交：48h 后按未提交方"无意向"处理；反馈文本过内容安全；含骚扰关键词自动转人工复核。

### 6.11 活动列表/详情/购票 `pages/events` `pages/event-detail`

- 【元素】列表：活动卡片（海报、主题、时间、地点、票价、剩余名额、男女比例进度条）；详情：活动介绍、流程、报名条件（认证状态/性别配额）、【立即报名】；购票：微信支付（云开发微信支付）。
- 【逻辑】报名 → 生成 `orders`（待支付）→ 支付回调成功 → `orders.paid` + 名额-1 + 订阅消息确认；性别配额满员 → 对应性别按钮置灰"男性名额已满，可候补"；候补队列有人退出时按序补位并通知。
- 【边界】支付超时 15 分钟释放名额；退款规则（活动前 48h 可退）在后端配置；订单状态机：`pending→paid→(refunding→refunded)/finished`。

### 6.12 消息中心 `pages/messages`

- 【元素】消息分类 Tab：匹配通知/约见提醒/活动通知/系统公告；未读红点。
- 【逻辑】所有订阅消息触达后同步落库 `notifications`；点击进入对应业务页。
- 【边界】用户未授权订阅消息时，关键流程依赖消息中心+首页状态兜底（订阅消息为一次性授权，每次关键节点重新引导授权）。

### 6.13 邀请好友页 `pages/invite`

- 【元素】我的邀请码（3 个名额进度条）；邀请海报（canvas 生成，含小程序码）；邀请记录（已加入/待认证）。
- 【逻辑】生成带 `invite_code` 的小程序码；被邀请人扫码进入登录流程，`verify-alumni` 自动识别邀请码路径；被邀请人认证通过 → 邀请人名额-1 并通知。
- 【边界】名额用尽显示"名额已用完，脱单毕业可获得更多"；邀请人不承担被邀请人材料审核豁免之外的任何背书责任（页面明示）。

### 6.14 毕业纪念页 `pages/memory`

- 【入口】反馈后双方持续联系 → 任一方在【我的】发起"我们在一起了"→ 对方确认 → 双方 `status=graduated`。
- 【元素】纪念卡片（匹配海报、第一次见面时间地点、认识天数）；【分享喜讯】（匿名化案例授权勾选）；邀请名额+3。
- 【边界】单方面发起对方 7 天未确认自动失效；毕业后可一键"回归匹配池"（恢复 active，双方均会收到状态变更提示）。

### 6.15 封禁告知页 `pages/banned`

- 【元素】封禁原因（类目级：放鸽子/骚扰/材料造假）、封禁时间、【申诉】入口（提交文字说明，转人工）。
- 【边界】封禁用户所有数据保留 180 天（配合可能的司法调取）；申诉仅 1 次机会，复核结论为终局。

### 6.16 个人中心 `pages/profile`

- 【元素】头像/昵称/认证徽章（实名✓校友✓）；我的人格速写入口；我的匹配历史；我的活动订单；设置（订阅消息管理、隐私政策、**账号注销**、紧急联系人设置）；客服与举报入口。
- 【逻辑】注销：弹窗二次确认 → 15 天冷静期 → 删除/匿名化全部个人信息（法定留存除外）。
- 【边界】紧急联系人（选填）：约见确认后可一键分享行程（生成 H5 分享卡片）。

---

## 7. 核心状态机

### 7.1 匹配状态机（`matches.status`）

```
created(周三00:00生成) ─▶ delivered(19:00已推送) ─▶ accepted_one(单方接受)
accepted_one ─▶ accepted_both(双方接受→排他) ─▶ date_planned ─▶ date_done ─▶ feedback_done ─▶ closed
delivered/accepted_one ─48h超时/婉拒─▶ expired
```

### 7.2 约见状态机（`dates.status`）

```
proposing(时间地点协商) ─▶ confirmed ─▶ checked_in(双方打卡) ─▶ completed
confirmed ─▶ cancelled(提前4h可取消) / no_show(放鸽子待核实)
```

### 7.3 用户违规记分（`users.violations`）

| 行为 | 记分 | 处置 |
|---|---|---|
| 匹配无回应（48h） | 1 分 | 累计 3 分暂停推荐 2 周 |
| 约见消极（不选时间） | 1 分 | 同上 |
| 临时取消（<4h） | 2 分 | 警告+暂停 1 周 |
| 放鸽子（核实） | — | **永久封禁** |
| 骚扰（核实） | — | **永久封禁** |
| 材料造假（核实） | — | **永久封禁** |

---

## 8. 数据库设计（云数据库集合）

> 所有集合默认仅创建者可读写（云开发权限），管理操作经云函数；敏感字段（身份证、手机号）加密存储（AES-256，密钥存云函数环境变量）。`_id`、`_openid` 为系统字段不重复列出。

### 8.1 `users` 用户主表

| 字段 | 类型 | 说明 |
|---|---|---|
| phone | string(加密) | 手机号 |
| real_name | string(加密) | 姓名 |
| id_card | string(加密) | 身份证号（仅存掩码+哈希用于查重） |
| id_card_hash | string | 查重用哈希 |
| gender | enum(m/f) | 性别 |
| birth_year | number | 出生年（由身份证解析） |
| city | string | 常驻城市 |
| status | enum | registered/realnamed/verified/active/exclusive/graduated/banned |
| realname_verified_at | timestamp | 实名通过时间 |
| alumni | object | {school, admission_year, grad_year, verify_type: invite/material, verify_status: pending/approved/rejected, reject_reason, material_file_ids[]} |
| invite_quota | number | 剩余邀请名额（默认 3） |
| invited_by | string | 邀请人 userId（可空） |
| participate_this_week | bool | 本周是否参加匹配 |
| violations | number | 违规记分 |
| pause_until | timestamp | 暂停推荐截止（可空） |
| subscribe_auth | object | 各模板授权计数 |
| current_match_id | string | 排他中匹配 ID（可空） |
| partner_id | string | 毕业伴侣 userId（可空） |
| emergency_contact | object(加密,可空) | {name, phone} |
| created_at / updated_at | timestamp | |

### 8.2 `profiles` 人格档案（AI 建档产物）

| 字段 | 类型 | 说明 |
|---|---|---|
| user_id | string | 关联用户 |
| score | number | 建档评分 0-100 |
| traits | array | 特质标签 [{key, weight}]（如 adventurous:0.8） |
| personality_text | string | 人格速写文案 |
| lifestyle | object | 作息/社交/消费观结构化 |
| attachment_style | string | 依恋类型 |
| values | array | 价值观关键词 |
| hard_prefs | object | {age_min, age_max, cities[], height_min, height_max, education_min} |
| soft_prefs | object | 软性偏好结构化 |
| dealbreakers | array | 一票否决项 |
| aesthetic_refs | array(file_id) | 心动类型参考照（绝不外显） |
| embedding | array(number) | 人格向量（用于匹配，由模型 embedding 接口生成） |
| feedback_vector | object | 反馈回流调整量 |
| version | number | 档案版本（每次修改+1） |

### 8.3 `chat_sessions` 建档会话

| 字段 | 类型 | 说明 |
|---|---|---|
| user_id | string | |
| act | number | 当前幕（1-5） |
| messages | array | [{role, content, ts}]（模型上下文窗口外做摘要压缩） |
| finished | bool | |
| finalized_profile_id | string | |

### 8.4 `matches` 匹配

| 字段 | 类型 | 说明 |
|---|---|---|
| week_id | string | 周次（如 2026-W35） |
| user_a / user_b | string | 双方 userId（约定 user_a < user_b 防重复） |
| match_score | number | 匹配分 0-100 |
| reason_text | string | "为什么匹配你"AI 解读 |
| common_path | string | 共同校友路径文案 |
| poster_file_id | string | 海报图（云存储） |
| status | enum | created/delivered/accepted_one/accepted_both/expired/date_planned/date_done/feedback_done/closed |
| a_action / b_action | enum(pending/accepted/declined/timeout) | |
| a_decline_reason / b_decline_reason | string | |
| deadline | timestamp | 48h 回应截止 |

### 8.5 `dates` 约见

| 字段 | 类型 | 说明 |
|---|---|---|
| match_id | string | |
| time_slots | array | 候选时段 [{start, end}] |
| venue_options | array | 候选地点 [{name, address, lat, lng, avg_price}] |
| a_choice / b_choice | object | {slot_index, venue_index} |
| final | object | {time, venue}（确认后） |
| status | enum | proposing/confirmed/cancelled/no_show/checked_in/completed |
| a_checkin / b_checkin | object | {ts, lat, lng} |
| cancel_by / cancel_at | string/timestamp | |

### 8.6 `feedbacks` 反馈

| 字段 | 类型 | 说明 |
|---|---|---|
| match_id / from_user / to_user | string | |
| met | bool | 是否见面 |
| willing_again | bool | 愿意再见面（互盲） |
| ratings | object | {sincerity, match, chat}（1-5） |
| tags | array | 结构化标签 |
| free_text | string | 自由文本（仅平台可见） |
| unlocked | bool | 双方均愿意后解锁联系 |

### 8.7 `events` 活动 / 8.8 `orders` 订单 / 8.9 `invites` 邀请 / 8.10 `reports` 举报 / 8.11 `notifications` 消息 / 8.12 `venues` 合作场地 / 8.13 `bans` 封禁记录 / 8.14 `admin_logs` 管理操作日志

（字段从对应页面需求直推：`events` 含 title/poster/time/venue/price/quota_m/quota_f/sold_m/sold_f/status；`orders` 含 event_id/user_id/amount/status(pending/paid/refunding/refunded/finished)/transaction_id；`invites` 含 code/from_user/to_user/used；`reports` 含 type(noshow/harassment/fake)/reporter/reported/evidence/status/result；`notifications` 含 user_id/type/title/content/read。）

---

## 9. 云函数 / API 清单

> 统一约定：入参 `action` 路由；返回 `{code:0, data} | {code:非0, msg}`；所有写操作幂等（客户端带 requestId）；所有接口鉴权（云函数内取 openid 映射 userId，校验 status 权限）。

### 9.1 `auth`
| action | 入参 | 返回 | 说明 |
|---|---|---|---|
| login | code | {userId, status, isNew} | wx.login 换 openid，Upsert 用户 |
| getPhone | code | {phone} | 手机号解密 |
| realnameVerify | {name, idCard, faceToken} | {pass} | 调人脸核身，写加密字段，状态→realnamed |
| alumniVerify | {school, admissionYear, inviteCode?} 或 {materialFileIds} | {verifyStatus} | 邀请码秒过/材料进审核队列 |
| cancelAccount | {} | {} | 进入注销冷静期 |

### 9.2 `aiChat`
| action | 入参 | 返回 | 说明 |
|---|---|---|---|
| start | {} | {sessionId, firstMsg} | 开启建档会话 |
| chat | {sessionId, message, audioFileId?} | {reply, act, progress} | 单轮对话；语音先转文字；内容安全检测；超时兜底 |
| finalize | {sessionId} | {profile, score} | 生成档案+评分+向量 |
| revise | {profileId, act} | {sessionId} | 回幕修改 |

### 9.3 `matchEngine`（定时触发器：每周三 00:00）
- 无入参（定时触发）；流程见第 10 章；产出 `matches` 记录与海报文件。

### 9.4 `matchAction`
| action | 入参 | 返回 | 说明 |
|---|---|---|---|
| accept | {matchId} | {status} | 幂等；双方均接受→排他+生成 dates |
| decline | {matchId, reason} | {} | |
| proposeChoice | {dateId, slotIndex, venueIndex} | {status, final?} | 交集判定 |
| checkin | {dateId, lat, lng} | {checked} | 500m 地理围栏 |
| getCurrent | {} | {match, date} | 首页状态数据源 |

### 9.5 `feedback`
| submit | {matchId, met, willingAgain, ratings, tags, freeText} | {bothSubmitted, unlocked?} | 双方提交后判定解锁；回流 feedback_vector |

### 9.6 `events`
| list / detail / createOrder / payCallback / refund / waitlist | — | — | 标准电商模式；支付用云开发微信支付 |

### 9.7 `invite`
| myCode / applyCode | {code} | — | 名额扣减事务 |

### 9.8 `notify`（内部）
| sendSubscribe | {userId, templateId, data} | — | 订阅消息发送，失败落库 notifications 兜底 |

### 9.9 `admin`（运营后台用，需管理员鉴权）
| reviewAlumni / reviewReport / banUser / publishEvent / manualMatchAssist / stats | — | — | 见第 13 章 |

---

## 10. 匹配引擎 V1（可实现规则版）

> V1 目标是**稳定可解释**，V2 再引入人格模拟。引擎为云函数内纯函数，输入候选池，输出配对列表。

### 10.1 候选池过滤（硬性，按序执行）

1. `status=active` 且 `participate_this_week=true` 且 `pause_until<now`；
2. 同城（`city` 相同）；
3. 双向满足对方 `hard_prefs`（年龄、身高、学历下限）与 `dealbreakers`；
4. 排除：历史匹配过、历史婉拒过（90 天内）、举报关联人。

### 10.2 评分（0-100，加权）

| 维度 | 权重 | 计算 |
|---|---|---|
| 人格相似/互补 | 40% | `embedding` 余弦相似度映射（相似度 0.6-0.85 区间得分最高——过于相似与过于相异均降分） |
| 软性偏好契合 | 25% | soft_prefs 关键词交集率 |
| 校友路径亲近 | 20% | 同校同届 20 分＞同校跨届 16＞同圈层跨校 12＞无路径 6 |
| 反馈修正 | 10% | feedback_vector 对偏好模型的偏移 |
| 活跃度平衡 | 5% | 优先补偿连续 2 周未获匹配的用户（反马太） |

### 10.3 配对求解

贪心+局部交换优化：按匹配分降序尝试配对，冲突时取全局总分更高的组合；男女比例失衡时，多余一方按 10.2 活跃度优先轮候下周（并推送"本周为你轮候"通知+赠送活动折扣券，避免流失）。

### 10.4 匹配解释生成

每对产出后调用大模型生成 `reason_text`（基于双方 traits 交集，禁用夸张承诺词，词库黑名单："命中注定/灵魂伴侣/百分百"），并生成匹配海报（canvas 服务端合成或客户端首屏合成，存云存储）。

### 10.5 每周三 19:00 推送

定时触发器批量调 `notify.sendSubscribe`（模板：`matches_new`），失败补发 1 次，仍失败仅落消息中心。

---

## 11. 微信能力与第三方接入清单

| 能力 | 用途 | 备注 |
|---|---|---|
| wx.login / getPhoneNumber | 登录与手机号 | 基础库 ≥3.x |
| 订阅消息模板 ×4 | ①匹配到达 ②约见确认/提醒 ③活动报名成功 ④审核结果 | 一次性订阅，每个关键节点重新引导授权 |
| 微信支付（云开发） | 活动购票 | 商户号需主体一致 |
| 人脸核身 | 实名认证 | 需企业资质开通；封装可替换第三方（阿里云/腾讯云金融级人脸） |
| security.msgSecCheck / imgSecCheck | 全部 UGC 文本/图片 | 同步+异步双检 |
| wx.getLocation | 到场打卡 | 仅打卡时申请，用途明示 |
| 同声传译插件 | 语音输入转文字 | 微信官方插件 |
| 大模型 API | AI 建档/解读/海报文案 | 已备案模型（默认 Moonshot/Kimi），服务端调用 |

---

## 12. 非功能需求

### 12.1 性能
- 首屏（首页）加载 ≤1.5s（4G）；匹配引擎 1 万人候选池跑批 ≤10 分钟；AI 对话单轮响应 P95 ≤4s。

### 12.2 安全与隐私（PIPL 合规）
- 敏感字段（身份证/手机号/人脸数据/紧急联系人）加密存储，密钥云函数环境变量管理，按环境隔离；
- 敏感个人信息采集前**单独同意**（实名、人脸、位置、相册各自独立弹窗，文案可后台配置）；
- 数据最小化：身份证仅存掩码+哈希；人脸比对结果不存原始生物特征；
- 账号注销后 15 天内完成删除/匿名化（法定留存数据除外）；
- 隐私政策、用户协议、未成年人保护声明三个页面随首版上线；
- 云数据库权限：所有集合"仅创建者可读写"，跨用户读取必须经云函数并鉴权。

### 12.3 风控
- 一证一号、一手机号一号；设备指纹（可选）防批量注册；
- 举报 SLA：骚扰类 4h 内人工响应；放鸽子类 24h 内核定；
- 全部管理操作写 `admin_logs`。

### 12.4 可用性
- 核心流程（认证/建档/匹配回应/约见确认）全部支持断点续作；
- 全局错误 toast 统一文案规范：用户可读、不含技术术语。

---

## 13. 运营后台（简版 Web，V1 范围）

> 技术栈不限（可用云开发低码或简单 React + 云函数 `admin`），仅管理员账号可访问，功能优先级如下：

| 模块 | 功能 | 优先级 |
|---|---|---|
| 校友审核 | 材料查看、通过/驳回（填原因） | P0 |
| 举报处理 | 举报列表、证据查看、封禁/驳回操作 | P0 |
| 活动管理 | 创建/上下架活动、名额与性别配额配置、订单与退款 | P0 |
| 匹配监控 | 每周跑批结果、配对率、手动协调（无交集约见） | P0 |
| 数据看板 | 漏斗（注册→认证→建档→匹配→见面→反馈）、见面率、NPS | P1 |
| 用户管理 | 用户查询、违规记分查看、解封申诉处理 | P1 |
| 文案配置 | 学校白名单、活动场次、弹窗文案 | P1 |

---

## 14. 埋点需求（接入微信小程序数据分析+自定义事件）

| 事件 | 触发 | 关键参数 |
|---|---|---|
| page_view | 每页 | page, status |
| auth_funnel | 认证各步 | step, result, fail_reason |
| chat_progress | 建档每幕完成 | act, duration |
| match_view / accept / decline | 匹配详情 | match_id, score, action, reason |
| date_confirmed / checkin | 约见 | date_id, venue |
| feedback_submit | 反馈 | willing_again, ratings |
| invite_send / invite_success | 邀请 | code |
| event_purchase | 购票 | event_id, amount |

北极星看板指标：匹配→见面率 = date(checkin) / match(delivered)。

---

## 15. 验收标准（UAT Checklist）

- [ ] 新用户从登录到进入匹配池全流程可走通，认证总时长 ≤5 分钟（不含人工审核）；
- [ ] 未满 18 岁、未毕业、重复身份证三个拦截用例全部生效；
- [ ] AI 建档：5 幕完整走完可生成档案；中途退出可续聊；<70 分走补全流程；
- [ ] 周三 19:00 测试环境可触发匹配推送（提供"模拟周三"调试开关）；
- [ ] 双方接受→排他→选时选地→确认→打卡→反馈→解锁/回池，全状态机流转正确，无并发脏写（两人同时操作）；
- [ ] 婉拒/超时/放鸽子/骚扰/造假五类处置路径全部符合第 7 章；
- [ ] 反馈互盲：单方愿意时对方不可见意向；
- [ ] 活动购票：支付、超时释放、性别配额、候补、退款五个用例通过；
- [ ] 邀请码：名额扣减、被邀请人直通认证、海报生成正确；
- [ ] 注销：冷静期后数据匿名化验证；
- [ ] 全部 UGC 过内容安全（测试样本：涉政/涉黄/辱骂各 3 条）；
- [ ] 性能：首屏 ≤1.5s、AI 单轮 P95 ≤4s 实测达标。

---

## 16. 迭代规划

| 版本 | 内容 | 依赖 |
|---|---|---|
| **V1.0（本文档）** | 认证+建档+周匹配+约见+反馈+活动+邀请 | ICP 许可证、社交-婚恋类目、算法备案 |
| V1.1 | 匹配海报社交分享优化、活动候补自动化、NPS 调研内置 | V1.0 数据 |
| V2.0 | 会员体系与支付（每周多匹配/优先权/报告解读）、匹配引擎 V2（人格模拟）、红娘预约入口 | 付费率验证 |
| V3.0 | 1v1 红娘工作台、结果对赌（托管支付）、情侣空间、跨城匹配 | 红娘服务 SOP |

---

## 附录 A：关键文案规范

- AI 红娘人设名"红娘小频"，口吻：朋友感、口语化、不说教、不催婚；
- 禁用词（全产品）："学历鄙视链/精英专属/包结婚/灵魂伴侣/命中注定"；
- 安全提示标准文案："请把第一次见面安排在白天的公共场所。你可以随时将行程分享给紧急联系人。"

## 附录 B：环境约定

- 云开发环境：test（开发）/ prod（正式）隔离；"模拟周三"调试开关仅 test 环境可见；
- 大模型密钥、支付密钥、人脸核身密钥全部走云函数环境变量，不入代码库。
