# 寻梅 — 数据库与数据架构设计书

| 属性 | 说明 |
|------|------|
| 文档版本 | 0.2 |
| 状态 | 草案 |
| 读者 | 后端、DBA、用于大模型上下文 |
| 相关文档 | [00-OVERVIEW](./00-OVERVIEW.md) · [02-BACKEND](./02-BACKEND.md) · [05-API-AND-GLOSSARY](./05-API-AND-GLOSSARY.md) |

---

## 1. 文档目的与范围

### 1.1 目的

规定 **持久化数据** 的结构、**向量检索** 策略、**索引与一致性** 规则，以及 **迁移** 流程，保证业务真相单一、与匹配流水线一致。

### 1.2 范围

- 逻辑表、主键、关键字段语义。
- pgvector 维度、距离算子、索引类型选择原则。
- 嵌入与文本一致性的约束。

### 1.3 非范围

- REST 路径与 HTTP 语义（见 05）。
- 具体 SQL 迁移文件内容（由 Alembic 版本库承载）。

---

## 2. 技术选型

| 项目 | 选型 |
|------|------|
| 引擎 | PostgreSQL 15+ |
| 扩展 | `pgvector` |
| 向量距离 | 余弦相似度（与 `embedding` 归一化策略一致） |
| 迁移 | Alembic **唯一**权威 |

---

## 3. 概念模型（ER 概览）

```mermaid
erDiagram
  users ||--o| profiles : has
  users ||--o{ match_jobs : creates
  users ||--o{ echo_cache : viewer
  profiles ||--o{ echo_cache : target
  users ||--o{ conversations : optional
}

```

---

## 4. 表设计（逻辑）

### 4.1 `users`

| 字段（逻辑） | 类型 | 说明 |
|--------------|------|------|
| `id` | UUID PK | 用户主键 |
| `email` | 唯一，可空 | 或 OAuth `subject` 存于独立列 |
| `created_at` | timestamptz | |

### 4.2 `profiles`

| 字段（逻辑） | 类型 | 说明 |
|--------------|------|------|
| `id` | UUID PK | Profile 主键（对外 API 的 `profile_id`） |
| `user_id` | UUID FK UNIQUE | 一人一条 |
| `display_name` | text | 展示名 |
| `bio` | text | 个人简介（嵌入来源） |
| `city` / `calling` 等 | text，可空 | 展示字段，与 stitch 对齐 |
| `avatar_url` | text，可空 | 对象存储 URL |
| `visibility` | enum | `public` / `hidden` 等（产品定义） |
| `embedding` | vector(n) | **n** 与 `EMBEDDING_MODEL` 一致 |
| `embedding_version` | int 或 uuid | 可选，用于与文本版本对齐 |
| `updated_at` | timestamptz | bio 变更触发刷新 |

### 4.3 `match_jobs`

| 字段（逻辑） | 类型 | 说明 |
|--------------|------|------|
| `id` | UUID PK | 即 `job_id` |
| `requester_id` | UUID FK | |
| `prompt_text` | text | 可存原文；日志侧仍禁止打印 |
| `status` | enum | `pending` / `running` / `completed` / `failed` |
| `result_json` | jsonb | 排序结果与元数据 |
| `error_code` | text，可空 | 稳定内部码 |
| `created_at` | timestamptz | |

### 4.4 `echo_cache`

| 字段（逻辑） | 类型 | 说明 |
|--------------|------|------|
| `viewer_id` | UUID | 当前用户 |
| `target_profile_id` | UUID | 对方 Profile |
| `prompt_hash` | bytea 或 text | 对 `prompt` 归一化后哈希 |
| `content_json` | jsonb | Echo 结构化内容 |
| `created_at` | timestamptz | PK 或唯一约束：`(viewer_id, target_profile_id, prompt_hash)` |

### 4.5 `conversations` / `messages`（可选，Echoes）

MVP 可仅占位表结构；**消息真相**一旦启用须与 02 的聊天 API 同步。

---

## 5. 索引策略

| 表 | 索引 | 目的 |
|----|------|------|
| `profiles` | `user_id` UNIQUE | 一人一条 |
| `profiles` | HNSW 或 IVFFlat on `embedding` | 近似最近邻；参数随数据量调优 |
| `match_jobs` | `(requester_id, created_at DESC)` | 列表与排障 |
| `echo_cache` | 唯一 `(viewer_id, target_profile_id, prompt_hash)` | 防重复 |

**pgvector 版本差异**：若 HNSW 不可用则 IVFFlat，**lists** 需在数据量达万级后重新调参。

---

## 6. 向量与文本一致性

**不变量**：用于检索的 `embedding` 必须对应**当前** `bio`（及参与嵌入的字段）的语义。

**实现要求**：

- `bio` 更新 → 发布 **嵌入刷新任务**（见 02）。
- 可选：`embedding_version` 与内容 hash 绑定；匹配前校验。

---

## 7. 事务边界

- **创建 Match Job**：插入 `match_jobs` + 投递队列应在**同一业务事务**或**可补偿**流程中，避免「有 Job 无任务」。
- **Echo 写入**：缓存写入与读取使用事务隔离级别避免脏读（默认 `READ COMMITTED` 通常足够）。

---

## 8. 迁移与版本管理

- 所有 DDL **仅**通过 Alembic 迁移。
- 禁止在生产手工 `ALTER` 后与代码分叉。
- 大表加索引：`CONCURRENTLY`（若 Alembic 支持）或维护窗口。

---

## 9. 数据保留与合规（基线）

- 用户删除账号：级联删除或匿名化策略由产品定义；须在实现中显式列出。
- prompt 存储：若需最小化，可仅存 hash + 短期 TTL（演进）。

---

## 10. 修订记录

| 版本 | 说明 |
|------|------|
| 0.1 | 初稿 |
| 0.2 | 扩展为数据库架构设计书 |
