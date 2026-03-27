# 寻梅 — API、集成契约与领域术语设计书

| 属性 | 说明 |
|------|------|
| 文档版本 | 0.2 |
| 状态 | 草案 |
| 读者 | 前后端、测试、用于大模型上下文 |
| 相关文档 | [00-OVERVIEW](./00-OVERVIEW.md) · [01-FRONTEND](./01-FRONTEND.md) · [02-BACKEND](./02-BACKEND.md) · [04-DATABASE](./04-DATABASE.md) |

---

## 1. 文档目的与单一事实来源（SSOT）

### 1.1 目的

统一 **REST 语义**、**领域术语中英文**、**查询文本 Q 的构造规范**、**错误码** 及 **与 OpenAPI 的关系**，避免前后端与提示词各写一套。

### 1.2 SSOT 层级

| 内容 | 权威来源 |
|------|----------|
| JSON 字段名、类型、必填、示例 | **OpenAPI**（`/openapi.json`，由 FastAPI 生成） |
| 路径前缀、资源名、状态机语义、术语表、**Q 的拼接规则** | **本文档** |
| 若 OpenAPI 与本文冲突 | **以 OpenAPI 为字段级真相**；**以本文为路径与语义真相**——须立刻修正其一 |

---

## 2. 全局约定

| 项目 | 约定 |
|------|------|
| API 版本前缀 | `/v1` |
| 内容类型 | `application/json`；`charset=utf-8` |
| 时间 | ISO 8601，`timestamptz` 语义 |
| ID | UUID string |
| 鉴权 | `Authorization: Bearer <access_token>`（除非端点标明公开） |

---

## 3. 领域术语表（固定）

| 中文 | 英文 | 定义 |
|------|------|------|
| 寻梅 | Seeking Plum | 产品名称 |
| 心念 | prompt | 用户**当次**输入的搜寻意图文本 |
| 简介 | bio / self_intro | 用户**长期**个人简介，可参与嵌入 |
| 回响 | Echo | AI 生成的**契合解读**，在匹配详情页展示 |
| 匹配作业 | Match Job | 异步任务，含生命周期状态机 |
| 查询文本 | Q | 将简介与心念拼接后用于 **Embedding 与检索** 的字符串（见 §5） |
| Profile | profile | 对外可展示的用户资料实体，含 `profile_id` |

---

## 4. 查询文本 Q（规范性定义）

**用途**：同一规则用于「匹配时」的查询向量计算；**顺序不可交换**。

**定义**：

```
Q = normalize(self_intro) + "\n---\n" + normalize(prompt)
```

- `normalize`：实现侧统一函数：去除首尾空白、统一换行符为 `\n`、可选合并连续空行（具体规则以代码 `normalize()` 为准，**全仓库唯一**）。
- `self_intro`：当前请求者**最新** Profile 简介文本。
- `prompt`：本次请求中的心念。

**哈希**：`prompt_hash` 用于 Echo 缓存键时，应对 `normalize(prompt)` 或与 `Q` 一致的约定字符串做哈希（实现二选一，**必须在代码中注释并与本表一致**）。

---

## 5. 核心端点（语义级）

以下为 **语义契约**；字段级定义见 OpenAPI。

### 5.1 Profile — 当前用户

| 方法 | 路径 | 语义 |
|------|------|------|
| `POST` | `/v1/profiles/me` | 创建或更新当前用户的 Profile（含 `bio` 等） |

**副作用**：`bio` 变更应触发嵌入刷新（见 [04](./04-DATABASE.md)）。

### 5.2 匹配

| 方法 | 路径 | 语义 |
|------|------|------|
| `POST` | `/v1/match/run` | 提交 `prompt`，创建 Match Job，返回 `job_id` |
| `GET` | `/v1/match/jobs/{job_id}` | 查询 Job 状态与结果 |

**`match_jobs.status` 状态机**：

```
pending → running → completed
                 ↘ failed
```

### 5.3 公开资料

| 方法 | 路径 | 语义 |
|------|------|------|
| `GET` | `/v1/profiles/{profile_id}` | 获取公开资料（受 visibility 约束） |

### 5.4 Echo

| 方法 | 路径 | 语义 |
|------|------|------|
| `GET` | `/v1/profiles/{profile_id}/echo` | 生成或返回缓存的 Echo（鉴权为当前 viewer） |

查询参数（语义）：若需区分「是否强制刷新」，可用 `?refresh=true`（若实现；OpenAPI 为准）。

---

## 6. 响应与错误模型（语义）

### 6.1 成功

- HTTP 2xx；body 为 JSON，与 OpenAPI schema 一致。

### 6.2 业务错误

- HTTP 4xx / 5xx。
- body 建议包含稳定字段：

```json
{
  "code": "RATE_LIMIT",
  "message": "人类可读短句",
  "request_id": "可选，用于排障"
}
```

### 6.3 稳定错误码（节选）

| `code` | HTTP | 含义 |
|--------|------|------|
| `UNAUTHORIZED` | 401 | 未登录或令牌无效 |
| `FORBIDDEN` | 403 | 无资源权限 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `RATE_LIMIT` | 429 | 触发限流 |
| `JOB_NOT_FOUND` | 404 | 无效 `job_id` |
| `JOB_FAILED` | 409 或 200+子状态 | Job 已失败（具体以 OpenAPI 为准） |
| `INTERNAL` | 500 | 未分类服务器错误 |

**前端**：仅依赖 `code` 做分支，**不**解析 `message` 机器逻辑。

---

## 7. 限流（语义）

- `POST /v1/match/run`：按**用户**限流（见 [02](./02-BACKEND.md)）。
- 响应头可包含 `Retry-After`（秒）。

---

## 8. 版本演进

- **不**在 URL 中混用 `/v2` 与 `/v1` 于同一客户端；大版本迁移需并存期与弃用公告。
- 破坏性变更：新资源或新字段优先 **additive**；删除字段需版本边界。

---

## 9. 与其他文档的交叉引用

| 主题 | 文档 |
|------|------|
| 匹配流水线阶段 | [02-BACKEND](./02-BACKEND.md) §6 |
| 表与缓存键 | [04-DATABASE](./04-DATABASE.md) |
| 前端轮询与错误展示 | [01-FRONTEND](./01-FRONTEND.md) |

---

## 10. 修订记录

| 版本 | 说明 |
|------|------|
| 0.1 | 初稿 |
| 0.2 | 扩展为 API 与术语设计书 |
