# 多用户功能执行规划

## 文档状态

- [FRAME] 状态：`Planned`，尚未开始功能实现。
- [FRAME] 优先级：High。
- [COMPUTED] 代码审查基线：`v0.1.15-beta.1`，commit `93f782a60bfc`。
- [FRAME] 本文是当前多用户工作的唯一执行规划；旧方案中的有效期、配额、公开注册和通知设计全部由本文取代。

## 先固定一个不能含糊的状态语义

[INFERRED] “用户暂停或删除时资产数据库状态完全不变”不能按字面应用到 `runtime_state`：如果运行态已经被卸载，数据库仍显示 `active`，控制台就会报告不存在的在线运行态。

[FRAME] 本轮采用下面的严格边界：

- [FRAME] 用户暂停或软删除时，不删除 API Key、Client、隧道、流量或活动数据。
- [FRAME] 用户暂停或软删除时，不修改 API Key 的 `is_active`、隧道配置、隧道 `desired_state` 或资源所有者。
- [FRAME] 已经停止承载流量的隧道必须把事实运行态投影为 `offline`；Client 必须投影为离线。
- [FRAME] 隧道通过派生问题 `owner_paused` 或 `owner_deleted` 解释“资产本身配置有效，但所有者当前不允许运行”。
- [FRAME] `error` 不写入用户状态原因，避免把所有者策略伪装成资产配置故障。
- [FRAME] 用户恢复为正常状态后，仍为 `desired_state = running` 的隧道沿用现有 reconcile 路径恢复；不另建恢复运行时。

## 已确认的产品模型

### 用户类型

- [FRAME] 系统只有 `super_admin` 和 `regular` 两种用户类型。
- [FRAME] 当前初始化产生的第一个用户，以及升级前已经存在的管理员，映射为受保护的超级管理员。
- [FRAME] 超级管理员也出现在用户列表中，也拥有自己的 API Key、Client、隧道、流量和活动范围。
- [FRAME] 第一版只允许超级管理员创建普通用户，不提供新增超级管理员、普通用户晋升、超级管理员降级等操作。
- [FRAME] 第一版不允许暂停或删除受保护的超级管理员，避免单管理员部署失去管理入口。

### 普通用户状态

- [FRAME] 普通用户的持久化 `status` 第一版只有 `active` 和 `paused`。
- [FRAME] `deleted_at` 与 `status` 正交；`deleted_at IS NOT NULL` 表示用户已软删除，不增加第三个持久化状态值。
- [FRAME] 用户是否允许运行资源由一个集中判定给出：

```text
user_operational = deleted_at IS NULL AND status = 'active'
```

- [FRAME] 对未知的未来状态必须 fail closed；只有明确的 `active` 允许工作，不能用 `status != 'paused'` 判断。
- [FRAME] 用户必须保存 `created_at`、`updated_at` 和 `deleted_at`。
- [FRAME] 删除只填写 `deleted_at` 并更新 `updated_at`；不执行用户行或所属资源的物理删除。
- [FRAME] 第一版不提供用户恢复接口；如果以后需要恢复，单独定义删除后用户名、凭据和资源重启语义。
- [FRAME] 软删除用户的用户名第一版不允许复用，避免登录、活动日志和历史资源出现身份歧义。

### 资源所有权与管理员代操作

- [FRAME] API Key、Client、隧道、历史流量归属和用户范围活动都必须有用户所有权。
- [FRAME] 超级管理员管理某个用户的资源时，资源所有者仍是目标用户，活动 Actor 和 `created_by_user_id` 记录真实超级管理员。
- [FRAME] 第一版不提供任何资源转移接口，也不允许通过更新请求改变 `owner_user_id`。
- [FRAME] `client_to_client` 的两端 Client 必须属于同一个用户；超级管理员也不能绕过该约束创建跨用户隧道。
- [FRAME] Server 配置、允许端口、全局认证限流和管理员安全设置仍是 Server 全局资源，不强行挂到某个普通用户下面。

### 暂停、删除与恢复运行

- [FRAME] 暂停普通用户时，撤销其 Web Session、拒绝新的 Client 认证、关闭已在线的控制通道和数据通道、关闭相关 P2P 会话，并卸载其全部隧道运行态。
- [FRAME] 软删除普通用户执行与暂停相同的运行态收敛，并永久拒绝该用户登录和 Client 认证。
- [FRAME] 暂停和软删除都保留普通用户的密码凭据、API Key、Client Token、Client 注册、隧道配置、历史流量和活动数据。
- [FRAME] 恢复普通用户只把 `status` 改回 `active`；Web 用户需要重新登录，Client 使用保留的 Token 自动重连。
- [FRAME] Client 重连并且数据通道就绪后，现有 reconcile 恢复仍有运行意图的隧道。

### 当前范围明确不做的内容

- [FRAME] 不存在服务到期时间、续期、宽限期或到期扫描器。
- [FRAME] 本轮不实现用户配额；如果仍需要隧道数量、带宽或资源配额，另开设计，不把它混入身份与所有权迁移。
- [FRAME] 不实现公开注册、注册审批或邀请。
- [FRAME] 不实现通知、收件箱、已读/未读、消息投递或推送。
- [FRAME] 不实现资源转移、组织、团队、共享资源或跨用户隧道。
- [FRAME] 不实现用户硬删除。
- [FRAME] 不把 NetsGo 扩展为多 Server 实例或分布式控制面。
- [FRAME] 不实现目标服务健康检查。
- [FRAME] 不为 Web 与 Server API 保留旧接口 fallback；二者同二进制、同版本升级。
- [FRAME] 不在本轮设计数据库备份、Server 回滚流程、数据降级或回滚补偿逻辑。

## 当前实现证据与改造约束

- [KNOWN] `internal/server/migrations/001_server_runtime_schema.sql` 中的登录身份当前存放在 `admin_users`，Web Session 当前存放在 `admin_sessions`。
- [KNOWN] `internal/server/auth_middleware.go` 的 JWT 当前只携带 `sid`，`RequireAuth` 只从 `admin_sessions` 解析主体。
- [KNOWN] `internal/server/server_http.go` 中 Client、隧道和 `/api/admin/*` 路由当前大多只经过同一个 `RequireAuth`。
- [KNOWN] `registered_clients`、`api_keys`、`tunnels` 和 `traffic_buckets` 当前没有用户所有权字段。
- [KNOWN] `tunnels.created_by_user_id` 已存在，但它表达执行者而不是资源所有者。
- [KNOWN] 当前 `owner_client_id` 表达隧道拓扑中的业务所有 Client，不表达登录用户所有权。
- [KNOWN] `pkg/protocol/message.go` 的 `AuthRequest` 只发送 Key 或 Token、`install_id` 和 Client 信息，没有用户字段。
- [KNOWN] `internal/server/data.go` 的数据通道握手使用 `client_id + data_token` 并绑定当前逻辑 Client 会话。
- [KNOWN] `internal/server/session.go` 已有逻辑会话失效路径，可关闭控制连接、数据 `yamux`、P2P 和关联运行态。
- [KNOWN] `internal/server/unified_tunnel_reconcile.go` 统一处理启动、重试和 Client 恢复后的隧道 reconcile。
- [KNOWN] `internal/server/control_loop.go` 仍存在 Client 控制通道发起的 legacy `MsgTypeProxyCreate` 写路径。
- [KNOWN] `activity_events` 已保存严重程度、类别、动作、来源、Actor 和结构化 Payload，但当前没有用户可见范围字段。
- [KNOWN] `web/src/lib/router.ts` 使用 TanStack Router Hash History。
- [KNOWN] `web/src/routes/dashboard.tsx` 当前在 Dashboard 外壳中全局加载 Client；这会阻碍用户列表作为管理员首页，也会增加跨用户缓存污染风险。
- [KNOWN] `web/src/components/custom/dashboard/OverviewPage.tsx` 当前已经包含“网络拓扑”“客户端”“隧道”三个模块，可改造成显式用户作用域组件。
- [KNOWN] `web/src/hooks/use-clients.ts` 和事件流缓存当前使用全局 `['clients']` Query Key，必须加入用户作用域。

## 数据模型

### 统一用户目录

[FRAME] 新增 `users` 作为身份目录和资源所有权的权威表；超级管理员的密码、MFA 和 Passkey 继续由现有管理员表保存，避免一次性重写成熟的管理员安全逻辑。

[FRAME] 建议 migration 名称为 `012_multi_user_ownership.sql`，核心结构如下：

```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    user_type TEXT NOT NULL
        CHECK (user_type IN ('super_admin', 'regular')),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (length(status) > 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX idx_users_page
    ON users(created_at DESC, id DESC);
CREATE INDEX idx_users_status_page
    ON users(status, created_at DESC, id DESC);
CREATE INDEX idx_users_deleted_page
    ON users(deleted_at, created_at DESC, id DESC);
```

- [INFERRED] `status` 不使用只允许两个值的数据库 CHECK，因为已经确认未来可能增加状态；Go 服务层只允许当前已实现的转换。
- [FRAME] `user_type` 第一版是稳定的二值字段，可以在数据库层约束。
- [FRAME] `updated_at` 在用户名、状态、删除时间或密码凭据发生管理变更时更新。
- [FRAME] 超级管理员在 `users` 与 `admin_users` 使用同一个 ID，避免出现两个“管理员身份”。

### 普通用户凭据与 Session

[FRAME] 普通用户密码和 Session 使用独立表，不把普通用户放进 `admin_users` 或 `admin_sessions`。

```sql
CREATE TABLE user_password_credentials (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    password_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_user_sessions_user
    ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires
    ON user_sessions(expires_at);
```

- [INFERRED] 独立 Session 表可防止旧 Server 把普通用户 Session 当成管理员 Session。
- [FRAME] 普通用户 Session ID 使用明确前缀命名空间，不能只依赖 UUID 碰撞概率与管理员 Session 区分。
- [FRAME] 普通用户第一版只支持用户名和密码登录；管理员现有 MFA、Recovery Code 和 Passkey 能力不下放给普通用户。
- [FRAME] 密码重置必须撤销该普通用户的全部 Web Session，但不撤销 Client Token。

### 资源所有权字段

[FRAME] 第一版只在资源根和删除父资源后仍需独立查询的历史快照上持久化用户 ID：

```sql
ALTER TABLE api_keys
    ADD COLUMN owner_user_id TEXT REFERENCES users(id);

ALTER TABLE registered_clients
    ADD COLUMN owner_user_id TEXT REFERENCES users(id);

ALTER TABLE tunnels
    ADD COLUMN owner_user_id TEXT REFERENCES users(id);

ALTER TABLE traffic_buckets
    ADD COLUMN owner_user_id TEXT REFERENCES users(id);

ALTER TABLE activity_events
    ADD COLUMN scope_user_id TEXT REFERENCES users(id);
```

[FRAME] 建议索引：

```sql
CREATE INDEX idx_api_keys_owner
    ON api_keys(owner_user_id, created_at);
CREATE INDEX idx_registered_clients_owner
    ON registered_clients(owner_user_id, created_at);
CREATE INDEX idx_tunnels_user_topology
    ON tunnels(owner_user_id, topology, created_at);
CREATE INDEX idx_traffic_user_query
    ON traffic_buckets(owner_user_id, resolution, bucket_start);
CREATE INDEX idx_activity_events_user
    ON activity_events(scope_user_id, occurred_at_ns DESC, id DESC);
```

- [FRAME] 这些新增列在 SQLite 物理结构中先保持 nullable，以允许增量 ALTER 和兼容迁移；当前 Server 的所有写入口必须把非空所有者作为应用层不变量。
- [FRAME] `owner_user_id` 是授权、隔离和资源列表的唯一用户所有权来源。
- [FRAME] `created_by_user_id` 只记录创建执行者；超级管理员代用户创建时，两者故意不同。
- [FRAME] `scope_user_id` 表示哪一个用户范围可读取该活动；`NULL` 只用于真正全局、管理员安全或无法可靠归属的事件。

### 不重复持久化所有权的表

| 表 | 所有权来源 |
|---|---|
| `client_stats` | [FRAME] 通过 `client_id -> registered_clients.owner_user_id` 推导。 |
| `client_disk_partitions` | [FRAME] 通过 `client_id -> registered_clients.owner_user_id` 推导。 |
| `client_tokens` | [FRAME] 通过 `client_id` 和 `key_id` 解析并校验同一用户。 |
| `api_key_permissions` | [FRAME] 通过 `api_key_id -> api_keys.owner_user_id` 推导。 |
| `tunnel_resource_locks` | [FRAME] 通过 `tunnel_id -> tunnels.owner_user_id` 推导。 |
| `activity_event_clients` | [FRAME] 继承所属 `activity_events.scope_user_id`。 |
| `activity_event_tunnels` | [FRAME] 继承所属 `activity_events.scope_user_id`。 |

[INFERRED] 给这些派生表再写一份用户 ID 会产生必须长期维护的多份权威数据，没有收益。

### 升级与现有数据归属

- [FRAME] 已初始化数据库迁移时，把现有管理员按原 ID 插入 `users`，类型为 `super_admin`，状态为 `active`。
- [FRAME] 现有 API Key、Client、隧道和历史流量全部回填到该超级管理员名下。
- [FRAME] 已有 Client、隧道和 P2P 活动可可靠关联资源时回填超级管理员范围；全局管理员安全事件可以保留 `scope_user_id = NULL`。
- [FRAME] 现有 `created_by_user_id` 为空时不伪造历史执行者；资源所有权回填与审计执行者是两个问题。
- [FRAME] fresh DB 在 migration 时允许 `users` 为空；`AdminStore.Initialize` 必须在同一个初始化事务中同时写 `admin_users` 和匹配的 `users` 超级管理员行。
- [FRAME] `ResetAdminUser` 必须保留现有超级管理员的稳定用户 ID，只更新管理员凭据和用户名；不能继续删除后生成新 ID，否则其资产会成为孤儿。
- [FRAME] 管理员用户名修改必须在同一事务中同步 `users.username` 与 `admin_users.username`。
- [FRAME] legacy JSON 或其他当前版本导入路径产生无所有者资源时，必须在导入事务中显式绑定超级管理员。
- [FRAME] 当前 Server 在开始接受连接前执行幂等的无所有者归一化：任何资源根的空 `owner_user_id` 都绑定到受保护超级管理员；这是“无所有者资源归管理员”的持续不变量，不是备份或回滚流程。
- [FRAME] 当前版本 migration 完成后执行不变量验证：已初始化实例必须存在一个受保护超级管理员，且所有资源根不得残留空所有者。
- [FRAME] 新 migration 应接入 `partitionServerMigrations` 的 compatible 分组并补充 schema 验证；这只是沿用当前增量 schema 机制，不构成 Server 回滚方案。

## 统一请求主体与登录

### Principal

[FRAME] HTTP Context 从管理员专用 `SessionInfo` 收敛到统一请求主体：

```go
type PrincipalKind string

const (
    PrincipalSuperAdmin PrincipalKind = "super_admin"
    PrincipalRegular    PrincipalKind = "regular"
)

type RequestPrincipal struct {
    Kind      PrincipalKind
    UserID    string
    Username  string
    SessionID string
}
```

- [FRAME] JWT 增加主体类型 Claim；升级前缺少该 Claim 的 JWT 只按现有管理员 Session 解析。
- [FRAME] 普通用户 JWT 必须查 `user_sessions JOIN users`，每次请求验证 Session、`deleted_at` 和 `status`。
- [FRAME] 超级管理员 JWT 继续查 `admin_sessions`，并解析到匹配的 `users` 行。
- [FRAME] JWT 仍只是 Session 句柄，不能把用户状态或权限快照长期固化在 JWT 中。

### 登录接口

- [FRAME] 保留统一的 `POST /api/auth/login` 用户名密码入口；Server 先从 `users` 解析用户类型，再进入管理员或普通用户认证分支。
- [FRAME] 登录错误继续使用不区分“用户名不存在、密码错误、已暂停、已删除”的外部文案，内部错误码和活动日志记录真实原因。
- [FRAME] 管理员 MFA 流程保持现有接口；普通用户不会进入 MFA 分支。
- [FRAME] 新增 `GET /api/auth/me`，前端启动时必须用服务端 Session 重新确认主体，不能只相信持久化 Zustand 状态。
- [FRAME] `POST /api/auth/logout` 根据 Principal 删除正确的 Session 表记录。
- [FRAME] 登录限流覆盖两类密码登录，不为普通用户另开可绕过的无限流入口。

### 中间件

[FRAME] 中间件职责固定为：

```text
RequirePrincipal        验证任一 Web 主体并注入 RequestPrincipal
RequireSuperAdmin       只允许超级管理员
RequireOperationalUser  普通用户必须 deleted_at IS NULL 且 status = active
```

- [FRAME] `/api/admin/*` 全部改为 `RequireSuperAdmin`。
- [FRAME] 普通资源 Handler 不能只用 `RequirePrincipal`；它还必须把资源查询限制在 Principal 所有权内。
- [FRAME] 前端路由守卫只负责体验，后端中间件和带作用域的存储方法才是权限边界。
- [FRAME] 实施期间不能先把现有 `RequireAuth` 全局替换为“任意用户可登录”，再逐个修资源接口；普通用户登录能力必须在全部用户作用域闭合后才启用。

## 授权与操作矩阵

| 操作 | 正常普通用户 | 暂停/删除用户 | 超级管理员代操作 |
|---|---|---|---|
| 查看自己的资源 | [FRAME] 允许。 | [FRAME] Web Session 被撤销，用户本人不允许。 | [FRAME] 始终允许查看目标用户和其保留资源。 |
| 创建资源、签发或启用 Key | [FRAME] 允许。 | [FRAME] 拒绝。 | [FRAME] 仅当目标用户可运行时允许。 |
| 更新可能触发 reconcile 的配置 | [FRAME] 允许。 | [FRAME] 拒绝。 | [FRAME] 仅当目标用户可运行时允许。 |
| 启动、恢复、迁移隧道 | [FRAME] 允许。 | [FRAME] 拒绝。 | [FRAME] 不允许绕过目标用户状态。 |
| 停止或删除单个资产 | [FRAME] 允许。 | [FRAME] 用户本人无有效 Session。 | [FRAME] 即使目标用户暂停或删除也允许清理。 |
| 修改纯展示元数据 | [FRAME] 允许。 | [FRAME] 用户本人无有效 Session。 | [FRAME] 允许，但不得触发运行态启动。 |
| 暂停、恢复、软删除用户 | [FRAME] 不允许。 | [FRAME] 不允许。 | [FRAME] 只允许对普通用户执行。 |

- [FRAME] 普通用户请求其他用户的资源 ID 返回 `404`，避免通过 ID 枚举资源是否存在。
- [FRAME] 超级管理员代操作时必须显式选择目标用户；不能用空 `userID`、特殊 UUID 或布尔开关表达“全局权限”。
- [FRAME] 所有创建请求都由 Server 决定 `owner_user_id`，请求体不能覆盖。
- [FRAME] 所有更新请求都先按 `owner_user_id` 加载资源，再应用修改；禁止“全局加载后只在前端隐藏”。

## 资源写入与隔离规则

### API Key 与 Client

- [FRAME] 普通用户创建 Key 时绑定当前 Principal；超级管理员在目标用户页创建 Key 时绑定路径中的目标用户。
- [FRAME] 已有 Key 全部归超级管理员；它们的内容、有效状态和使用次数不因迁移改变。
- [FRAME] Client 使用 Key 换 Token 时，Server 从 Key 解析用户，先检查用户可运行，再写入或校验 `registered_clients.owner_user_id`。
- [FRAME] 同一 `install_id` 已存在时，新 Key 的用户必须与 Client 所有者一致；不同用户不能接管该 Client。
- [FRAME] Client Token 认证时通过 Token 的 `client_id` 和 `key_id` 解析同一个用户；不一致视为存储不变量错误并拒绝认证。
- [FRAME] 暂停或删除用户不修改 Key 的 `is_active`，也不撤销 Client Token；认证入口根据用户状态拒绝。
- [FRAME] 普通用户恢复后，既有 Client Token 继续用于自动重连。

### 隧道

- [FRAME] `server_expose` 隧道的 Target Client 必须与隧道 `owner_user_id` 一致。
- [FRAME] `client_to_client` 隧道的 Ingress Client 和 Target Client 都必须与隧道 `owner_user_id` 一致。
- [FRAME] REST 创建、更新、启动、停止、迁移和删除全部使用同一所有权服务层。
- [FRAME] legacy `MsgTypeProxyCreate` 从已认证 `ClientConn.OwnerUserID` 获取所有者，执行相同的用户状态和 Client 所有权检查。
- [FRAME] 隧道迁移只允许迁移到同一用户的 Client，不实现迁移时改变用户所有权。
- [FRAME] 隧道的统一运行语义继续来自 `TunnelSpec` endpoint 字段；不得借多用户改造重新依赖 legacy 扁平字段。

### 流量与活动历史

- [FRAME] 新流量桶从隧道保存 `owner_user_id` 快照，隧道或 Client 后续删除也不影响历史查询。
- [FRAME] 普通用户流量查询强制绑定当前 Principal，不能接受任意 `user_id` 查询参数。
- [FRAME] 超级管理员从目标用户页查询流量时使用显式管理员用户范围接口。
- [FRAME] 历史活动的用户范围保存于事件本身，不能在查询时只依赖可能已经删除的当前资源。

## 用户生命周期与运行态收敛

### 状态变更事务

[FRAME] 暂停、恢复和删除采用每用户串行化，并遵守下面的提交边界：

```text
1. 锁定目标用户生命周期操作
2. 事务内读取并验证当前用户类型、status、deleted_at
3. 写入用户变化、updated_at 和活动日志
4. 提交用户状态事务
5. 更新或失效 Server 内部用户策略缓存
6. 撤销 Web Session（暂停、删除）
7. 关闭该用户当前全部逻辑 Client 会话（暂停、删除）
8. 对该用户全部 desired_state=running 隧道执行策略阻断 reconcile
9. 发布带用户范围的 SSE 失效事件
```

- [FRAME] 第 4 步提交后用户状态已是权威门禁；即使后续清理遇到瞬时错误，新认证和新 reconcile 也必须被拒绝。
- [FRAME] 运行态清理失败必须记录活动和服务日志，并由现有 reconcile 重试路径继续收敛，不能把用户状态回滚成 `active`。
- [FRAME] 暂停、恢复和重复删除请求设计为幂等；没有实际状态转换时不重复写活动事件。

### 运行时索引与锁顺序

- [FRAME] `ClientConn` 增加只由 Server 认证结果设置的 `OwnerUserID`，不从 Client 消息接收该值。
- [FRAME] 单实例 Server 可以先遍历在线逻辑会话按 `OwnerUserID` 收敛；如果性能测试证明不足，再增加 `userID -> clientID` 内存索引。
- [FRAME] 用户生命周期锁、`clientTunnelMutationMu`、Client lifecycle 锁和 tunnel runtime operation 锁必须形成固定顺序并增加并发测试，避免暂停与重连、迁移或删除互锁。
- [FRAME] 用户状态事务不能在持有 WebSocket 写锁或等待 Client ACK 时保持打开。

### 所有运行入口都要门禁

[FRAME] 下面每个入口都必须调用同一个 `IsUserOperational(userID)` 服务，不能只保护 REST：

1. [FRAME] API Key 换取 Client Token。
2. [FRAME] Client Token 控制通道认证。
3. [FRAME] 控制通道认证完成到 `ClientConn` 发布之间的最终检查。
4. [FRAME] 数据通道握手返回成功之前的检查。
5. [FRAME] legacy Client 隧道创建。
6. [FRAME] REST 隧道创建、更新、启动和迁移。
7. [FRAME] Server 启动时的隧道恢复。
8. [FRAME] 周期 reconcile 重试。
9. [FRAME] Client 数据通道恢复触发的 reconcile。
10. [FRAME] P2P 会话授权、Grant 生成和重建。

[INFERRED] 只检查控制通道认证会留下“暂停发生在控制通道成功与数据通道上线之间”的竞态；只检查 REST 会留下 legacy 创建和自动恢复绕过。

## Client 控制通道和数据通道兼容性

### 不增加用户字段

- [FRAME] `AuthRequest` 不增加 `user_id`；Key 或 Token 已经足以让 Server 解析注册 Client 和所属用户。
- [FRAME] 数据通道握手不增加 `user_id`；Server 通过 `client_id + data_token` 找到当前逻辑会话及其 `OwnerUserID`。
- [FRAME] `TunnelProvisionRequest`、Provision ACK、数据流 Header 和 P2P 信令不增加用户字段。
- [FRAME] Client 不承担租户授权；所有权校验只在 Server 完成。

[INFERRED] 因此核心控制消息和数据帧结构不需要变化，旧 Client 与新 Server 的主要兼容风险来自认证失败语义，而不是用户 ID 编解码。

### 认证失败语义

[FRAME] 可以复用现有 `AuthResponse.Code`、`Retryable` 和 `ClearToken` 表达用户门禁：

| 原因 | `Code` | `Retryable` | `ClearToken` | 预期 Client 行为 |
|---|---|---:|---:|---|
| 用户暂停 | [FRAME] `user_paused` | [FRAME] `true` | [FRAME] `false` | [FRAME] 保留 Token，按现有退避重连，恢复后自动上线。 |
| 用户删除 | [FRAME] `user_deleted` | [FRAME] `false` | [FRAME] `false` | [FRAME] 保留资产凭据但停止无意义重试；不把用户删除误判成 Token 损坏。 |

- [KNOWN] 当前 Client 对未知 `Code` 已按 `Retryable` 和 `ClearToken` 通用处理。
- [INFERRED] 更老的已发布 Client 是否具有相同行为不能凭当前代码外推，必须通过版本兼容测试确认。
- [FRAME] 暂停时主动关闭已在线连接，重连请求收到 `user_paused`；不能只等待网络自然断开。
- [FRAME] 删除时已在线连接先被关闭，后续认证收到 `user_deleted`。

## 管理 API 契约

### 用户 DTO

[FRAME] 管理 API 返回的用户对象至少包含：

```json
{
  "id": "user-id",
  "username": "alice",
  "user_type": "regular",
  "status": "active",
  "created_at": "2026-08-02T00:00:00Z",
  "updated_at": "2026-08-02T00:00:00Z",
  "deleted_at": null,
  "operational": true
}
```

- [FRAME] `operational` 是派生方便字段，权威数据仍是 `status + deleted_at`。
- [FRAME] 用户类型不可通过普通更新接口修改。
- [FRAME] 密码 Hash、Session ID、API Key 原文和 Client Token 不出现在用户 DTO。

### 用户列表与分页

[FRAME] 用户列表采用 Server 端 keyset/cursor 分页，默认按 `(created_at DESC, id DESC)` 稳定排序：

```text
GET /api/admin/users
    ?limit=50
    &cursor=<opaque>
    &query=<username>
    &status=active|paused
    &deleted=exclude|only|include
```

[FRAME] 返回结构：

```json
{
  "items": [],
  "next_cursor": null,
  "has_more": false
}
```

- [FRAME] `limit` 设默认值和硬上限，禁止通过超大 limit 退化成全表查询。
- [FRAME] cursor 是不透明值并绑定当前排序；筛选条件变化时前端丢弃旧 cursor。
- [FRAME] 用户列表必须包含超级管理员行。
- [FRAME] 如果列表显示 Client、在线 Client 和隧道数量，只对当前页用户做批量聚合，禁止每行一个查询。
- [FRAME] 第一版不要求返回全量 `total`；用户只需要稳定翻页，不为精确总数增加每次全表计数。

### 用户管理接口

[FRAME] 第一版接口：

```text
GET    /api/admin/users
POST   /api/admin/users
GET    /api/admin/users/{user_id}
PUT    /api/admin/users/{user_id}/username
PUT    /api/admin/users/{user_id}/password
POST   /api/admin/users/{user_id}/pause
POST   /api/admin/users/{user_id}/resume
DELETE /api/admin/users/{user_id}
POST   /api/admin/users/{user_id}/sessions/revoke
```

- [FRAME] `POST /api/admin/users` 只创建 `regular + active` 用户，并在一个事务中写用户、密码凭据和活动日志。
- [FRAME] pause、resume 和 delete 只接受普通用户；超级管理员返回稳定的受保护用户错误。
- [FRAME] delete 是软删除，不接受硬删除参数。
- [FRAME] 第一版没有 restore、transfer、promote 或 demote 接口。

### 显式管理员资源范围

[FRAME] 管理员用户详情页使用显式目标用户路径，不用可省略的 `user_id` 参数切换“全局或单用户”语义：

```text
GET /api/admin/users/{user_id}/console/snapshot
GET /api/admin/users/{user_id}/clients
GET /api/admin/users/{user_id}/tunnels
GET /api/admin/users/{user_id}/activity
GET /api/admin/users/{user_id}/keys
```

- [FRAME] 管理员创建 Key、Client 注册材料或隧道时，目标用户也必须来自显式路径或已经按路径加载的资源上下文。
- [FRAME] 现有 `/api/clients`、`/api/tunnels`、`/api/activity` 和流量接口改为当前 Principal 自身范围，不再让超级管理员身份隐式获得全量响应。
- [FRAME] 真正的 Server 全局配置仍留在 `/api/admin/config`、`/api/admin/security` 和全局访问控制接口。
- [FRAME] Web 与 Server 一起升级，前端直接切换到新契约，不写旧 API fallback、双请求探测或版本分支。

## “活动”的最终定位

### 名称

- [FRAME] 产品界面统一使用“活动日志”；不再称为“用户通知”。
- [FRAME] 后端可继续使用 `activity_events`、`/api/activity` 和现有 Go 类型名，避免没有语义收益的大范围重命名。
- [FRAME] “活动日志”是结构化的操作与运行事件时间线，不等同于进程 stdout/stderr 原始日志。

### 可见范围与 Actor

- [FRAME] 普通用户只能读取 `scope_user_id = principal.UserID` 的活动。
- [FRAME] 超级管理员可以读取全局活动，并按用户筛选；进入用户详情时默认固定为该用户范围。
- [FRAME] 超级管理员代用户操作时，`scope_user_id` 是目标用户，Actor 是超级管理员。
- [FRAME] 普通用户操作自己的资产时，范围和 Actor 都是该普通用户。
- [FRAME] Client 生命周期和隧道运行事件的 Actor 可以是 `client` 或 `system`，但范围必须从 Client 或隧道所有权解析。
- [FRAME] 管理员登录、MFA、Passkey 和 Server 配置等全局安全事件保持 `scope_user_id = NULL`，只对超级管理员可见。
- [FRAME] 密码、Token、Key 原文和敏感认证材料不得写入活动 Payload。

### SSE

- [FRAME] SSE 订阅必须绑定 Principal 和明确的用户范围，Snapshot、Client、Tunnel、Traffic 和 Activity 事件都在 Server 端过滤。
- [FRAME] EventBus 内部事件需要携带足够的 `scope_user_id` 元数据；不能把全局事件先发给浏览器再过滤。
- [FRAME] 用户切换、暂停、删除和退出时，前端关闭旧 SSE，并清除旧作用域的 TanStack Query 缓存。
- [FRAME] 不增加通知收件人、已读状态、通知偏好或投递表。

## 管理端信息架构与路由

### 路由结果

[FRAME] 超级管理员进入 Dashboard 后先看到分页用户列表，而不是一次加载全局 Client 和隧道：

```text
/dashboard
  super_admin -> /dashboard/users
  regular     -> 当前用户自己的资源页

/dashboard/users
  分页用户列表、搜索、筛选、添加、暂停、恢复、软删除

/dashboard/users/$userId
  用户详情页；tab=topology|clients|tunnels

/dashboard/users/$userId/clients/$clientId
  该用户范围内的 Client 详情
```

- [FRAME] 用户详情页的三个模块固定为“网络拓扑”“客户端”“隧道”。
- [FRAME] 超级管理员行可以进入详情并查看迁移到自己名下的现有资源，但暂停和删除按钮禁用。
- [FRAME] 已软删除用户默认不出现在列表；切换 deleted 筛选后可查看其保留资源，详情页只提供查看和清理类操作。
- [FRAME] 普通用户使用同一组作用域化资源组件，作用域固定为自身，不能选择其他用户。
- [FRAME] API Key 管理放入“客户端”模块的添加 Client 流程或用户范围子区域，不增加第四个顶层资源 Tab。
- [FRAME] 现有全局“活动”导航改名为“活动日志”；超级管理员页面增加用户筛选，不把它改成通知中心。

### 前端重构边界

- [FRAME] `DashboardLayout` 不再无条件调用全局 `useClients()`；资源数据下沉到用户作用域页面。
- [FRAME] 提取 `ResourceScope`，至少区分 `self` 与 `admin-user:{userId}`，并由 API wrapper 转换为明确后端路径。
- [FRAME] Query Key 必须包含用户 ID 或 `self`，例如 `['users', userId, 'clients']`、`['users', userId, 'tunnels']` 和 `['users', userId, 'activity']`。
- [FRAME] `OverviewPage`、`NetworkTopology`、`DashboardClientTable`、`DashboardTunnelTable`、Client Sidebar 和 Add Client Dialog 接收同一个 Scope，不各自猜当前用户。
- [FRAME] 切换目标用户时不能沿用上一用户的缓存作为占位数据；避免短暂展示跨用户数据。
- [FRAME] Logout、401、用户暂停和身份切换时清理所有用户范围 Query Cache。
- [FRAME] 路由继续使用 Hash History，业务组件继续放在 `web/src/components/custom/`，请求继续统一走 `web/src/lib/api.ts`。

## 分阶段执行计划

### 阶段 0：契约测试和安全护栏

**改动**

1. [FRAME] 把本文中的用户状态、所有权、不变式、错误码和路由契约转成测试命名与固定 Fixture。
2. [FRAME] 增加 `/api/admin/*` 必须为超级管理员的路由矩阵测试。
3. [FRAME] 增加普通用户不能访问尚未作用域化资源接口的拒绝测试，确保后续实现不会提前开放。
4. [FRAME] 准备 `v0.1.15-beta.1` 数据库和 Client 二进制的兼容测试 Fixture。

**阶段门**

- [FRAME] 在没有完成所有权隔离前，普通用户登录与前端入口保持不可用。
- [FRAME] 安全测试先失败且失败原因符合本文，才进入实现阶段。

### 阶段 1：兼容 Schema、用户 Store 与数据回填

**主要位置**

- [KNOWN] `internal/server/migrations/`
- [KNOWN] `internal/server/storage_schema.go`
- [KNOWN] `internal/server/storage_schema_test.go`
- [KNOWN] `internal/server/admin_store.go`
- [KNOWN] `internal/server/server_bootstrap.go`

**改动**

1. [FRAME] 新增 `users`、普通用户密码凭据、普通用户 Session 和所有权列。
2. [FRAME] 将 migration 加入 compatible 分组并更新精确 Schema/Index 测试。
3. [FRAME] 实现升级数据回填和 fresh initialization 双写。
4. [FRAME] 修改管理员用户名更新与 reset 流程，保持统一用户 ID。
5. [FRAME] 增加 `UserStore` 的创建、分页、状态转换、软删除和凭据事务。
6. [FRAME] 增加迁移后所有权不变量检查。

**验证**

- [FRAME] fresh DB、`v0.1.15-beta.1` DB、已有资源 DB 和 legacy import Fixture 全部验证。
- [FRAME] 证明现有 Key、Client、Tunnel、Traffic 全部归超级管理员且数量不变。
- [FRAME] 证明删除用户不会级联删除任何资产表。
- [FRAME] 证明管理员 reset 后原有资产仍引用同一个用户 ID。

**阶段门**

- [FRAME] 当前 Server 不再产生 `owner_user_id IS NULL` 的资源根。
- [FRAME] 迁移前后资源数量、隧道配置和运行意图完全一致。

### 阶段 2：Principal、认证与管理员边界

**主要位置**

- [KNOWN] `internal/server/auth_middleware.go`
- [KNOWN] `internal/server/admin_api.go`
- [KNOWN] `internal/server/admin_security_api.go`
- [KNOWN] `internal/server/server_http.go`

**改动**

1. [FRAME] 引入统一 `RequestPrincipal`、JWT 主体类型和 Session 双表解析。
2. [FRAME] 将 `/api/admin/*`、管理员安全和全局配置明确收紧到超级管理员。
3. [FRAME] 扩展统一密码登录、logout 和 `/api/auth/me`。
4. [FRAME] 实现普通用户密码校验、Session 创建、撤销和状态门禁。
5. [FRAME] 保持升级前管理员 JWT 的缺省管理员解析路径。

**验证**

- [FRAME] 覆盖管理员密码、MFA、Passkey、普通用户密码、Session UA 绑定、过期 Session 和撤销 Session。
- [FRAME] 覆盖暂停、删除、伪造主体类型、普通 Session ID 注入管理员路径和未知用户类型。

**阶段门**

- [FRAME] 任意普通用户都无法通过 `/api/admin/*` 或旧管理员 Session 路径提升权限。

### 阶段 3：用户管理 API 与分页

**主要位置**

- [FRAME] 新增用户管理 Handler/Store 文件，避免继续扩大单个 `admin_api.go`。
- [KNOWN] `internal/server/server_http.go`
- [KNOWN] `internal/server/activity_store.go`

**改动**

1. [FRAME] 实现分页列表、详情、添加、用户名修改、密码重置和 Session 撤销。
2. [FRAME] 实现受保护超级管理员约束。
3. [FRAME] 实现幂等 pause、resume 和 soft delete 的数据库事务及活动事件。
4. [FRAME] 此阶段只完成权威状态写入；对外开放 pause/delete 前必须完成阶段 5 的运行态收敛。

**验证**

- [FRAME] 覆盖 cursor 边界、同时间戳稳定顺序、筛选变化、最大 limit、并发重名和软删除用户名不可复用。
- [FRAME] 覆盖并发 pause/delete、重复请求和超级管理员保护。

**阶段门**

- [FRAME] 用户列表永不执行无上限查询，状态转换只有一条事务入口。

### 阶段 4：所有资源的用户作用域

**主要位置**

- [KNOWN] `internal/server/admin_store.go`
- [KNOWN] `internal/server/control_auth.go`
- [KNOWN] `internal/server/unified_tunnel_api.go`
- [KNOWN] `internal/server/store.go`
- [KNOWN] `internal/server/traffic_store.go`
- [KNOWN] `internal/server/activity_store.go`

**改动**

1. [FRAME] API Key 创建、查询、状态变更和删除接入用户所有权。
2. [FRAME] Client 注册、重连、详情、改名、带宽、版本检查、流量和删除接入用户所有权。
3. [FRAME] 隧道 CRUD、动作、迁移和 legacy 创建接入同一作用域服务。
4. [FRAME] `client_to_client` 两端做同用户强校验。
5. [FRAME] 流量桶写入用户快照并实现 self/admin-user 两类查询。
6. [FRAME] 删除所有通过空用户 ID 表达全局权限的内部调用。

**验证**

- [FRAME] 为每个资源接口生成用户 A、用户 B、超级管理员三主体矩阵。
- [FRAME] 对每个按 ID 的接口验证跨用户返回 `404`。
- [FRAME] 覆盖 Key 与 Client owner 不一致、相同 install ID 接管、跨用户迁移和 legacy 创建绕过。

**阶段门**

- [FRAME] 普通用户身份开放前，所有 REST、后台和 legacy 写入口都已带显式 User Scope。

### 阶段 5：暂停、删除与运行态门禁

**主要位置**

- [KNOWN] `internal/server/control_auth.go`
- [KNOWN] `internal/server/data.go`
- [KNOWN] `internal/server/session.go`
- [KNOWN] `internal/server/control_loop.go`
- [KNOWN] `internal/server/unified_tunnel_reconcile.go`
- [KNOWN] `internal/server/client_relay.go`
- [KNOWN] P2P 管理相关 Server 文件

**改动**

1. [FRAME] `ClientConn` 保存 Server 解析的 `OwnerUserID`。
2. [FRAME] Key 交换、Token 控制认证和数据握手增加同一用户状态门禁。
3. [FRAME] pause/delete 复用逻辑会话失效路径关闭控制、数据、P2P 和运行态。
4. [FRAME] startup、retry、data-ready、legacy create 和 P2P Grant 全部增加门禁。
5. [FRAME] 运行态被阻断时保持 desired state，投影 offline 和 owner issue。
6. [FRAME] resume 依赖 Client 重连和现有 reconcile 恢复运行。
7. [FRAME] 完成后才对外启用阶段 3 的 pause、resume 和 delete 路由。

**验证**

- [FRAME] 暂停与控制认证、数据握手、Tunnel 创建、迁移、P2P 建链并发竞争全部覆盖。
- [FRAME] 证明暂停返回成功时已不存在该用户可承载流量的逻辑会话。
- [FRAME] 证明 Server 重启不会恢复暂停或删除用户的运行态。
- [FRAME] 证明恢复不改变原配置，Client 重连后只恢复原本 desired running 的隧道。

**阶段门**

- [FRAME] 任意一个运行入口缺少门禁都阻止进入前端阶段。

### 阶段 6：活动日志与 SSE 隔离

**主要位置**

- [KNOWN] `internal/server/activity_store.go`
- [KNOWN] `internal/server/activity_api.go`
- [KNOWN] `internal/server/events.go`
- [KNOWN] 各 Activity Producer 文件

**改动**

1. [FRAME] 所有用户资源活动写入 `scope_user_id`。
2. [FRAME] Actor 与 Scope 分开传递，覆盖管理员代操作。
3. [FRAME] 活动查询增加 self、admin-user 和 admin-global 三种明确入口。
4. [FRAME] SSE Envelope 增加服务端范围过滤，Snapshot 和增量使用同一 Scope。
5. [FRAME] 保留现有活动保留策略，不引入通知模型。

**验证**

- [FRAME] 用户 A 收不到用户 B 的 Client、Tunnel、Traffic、Activity 和恢复补洞事件。
- [FRAME] 管理员代用户操作同时显示正确的目标范围和真实 Actor。
- [FRAME] SSE 断线恢复 Cursor 不能跨用户补发。

**阶段门**

- [FRAME] 浏览器网络层无法观察到其他用户的事件 Payload。

### 阶段 7：管理员用户列表与用户详情前端

**主要位置**

- [KNOWN] `web/src/lib/router.ts`
- [KNOWN] `web/src/lib/auth.ts`
- [KNOWN] `web/src/lib/api.ts`
- [KNOWN] `web/src/stores/auth-store.ts`
- [KNOWN] `web/src/hooks/`
- [KNOWN] `web/src/components/custom/dashboard/`
- [KNOWN] `web/src/components/custom/client/`
- [KNOWN] `web/src/components/custom/tunnel/`

**改动**

1. [FRAME] Auth Store 从 `AdminUser` 改为统一 Principal，并在启动时调用 `/api/auth/me`。
2. [FRAME] 增加超级管理员用户列表、cursor 翻页、搜索、状态筛选和删除筛选。
3. [FRAME] 增加添加、暂停、恢复、软删除、改名、重置密码的对话框和确认流程。
4. [FRAME] 增加 `/dashboard/users/$userId`，复用三资源模块并注入 Scope。
5. [FRAME] 将 Query Key、Mutation invalidation、SSE 和 Client 详情路由全部用户化。
6. [FRAME] 把 API Key 管理接入目标用户的 Client 模块。
7. [FRAME] 把“活动”文案收敛为“活动日志”，增加管理员用户筛选。
8. [FRAME] 删除 Web API 兼容 fallback；只调用本版本 Server 契约。

**验证**

- [FRAME] 运行前端单元测试、`bun run lint` 和 `bun run build`。
- [FRAME] 浏览器手工验证管理员、正常普通用户、暂停用户、软删除用户和 Session 被撤销五类场景。
- [FRAME] 验证快速切换用户、浏览器返回、SSE 重连和 Query Cache 不出现跨用户闪现。

**阶段门**

- [FRAME] 超级管理员 Dashboard 默认不再全量查询所有 Client；用户列表是资源管理的第一入口。

### 阶段 8：系统验证与发布门

1. [FRAME] 运行相关 Go 包测试后运行 `go test ./...`。
2. [FRAME] 按 CI 顺序运行前端 lint/build、`go vet ./...` 和目标平台测试。
3. [FRAME] 运行 `make build` 验证前端嵌入和统一二进制。
4. [FRAME] 运行直连、nginx、caddy、控制通道、数据通道、Client-to-Client、断线重连和升级 E2E。
5. [FRAME] 运行下面单独定义的 P0 Server 回滚观察测试。
6. [FRAME] 只有数据隔离、暂停收敛、现有资源回填和 Client 跨版本矩阵全部有证据后才能发布 Beta。

## 测试矩阵

### Schema 与迁移

- [FRAME] fresh DB 初始化后恰有一个受保护超级管理员用户。
- [FRAME] `v0.1.15-beta.1` DB 升级后原管理员 ID 不变。
- [FRAME] 升级前所有 Key、Client、Tunnel 和 Traffic 数量不变且归管理员。
- [FRAME] 隧道 desired state、endpoint、transport policy 和资源锁迁移前后不变。
- [FRAME] soft delete 用户不会触发任何资产表级联删除。
- [FRAME] 管理员 reset、改名、重启后资产所有权不漂移。
- [FRAME] 当前 Server 的全部创建路径拒绝空 owner。

### 身份与隔离

- [FRAME] 用户 A 不能读取、修改、停止、迁移或删除用户 B 的任何资源。
- [FRAME] 用户 A 知道用户 B 的真实资源 ID 时仍得到 `404`。
- [FRAME] 普通用户不能访问任意 `/api/admin/*`。
- [FRAME] 普通用户不能把请求体中的 owner 改成其他用户。
- [FRAME] 超级管理员访问用户 A 资源时，活动 Actor 是管理员，Scope 是用户 A。
- [FRAME] 普通用户 Session 不能被旧管理员 Session 查询路径接受。
- [FRAME] soft deleted 用户名不能创建第二个同名用户。

### 用户列表

- [FRAME] 超级管理员包含在第一页或其稳定排序位置。
- [FRAME] 同 `created_at` 用户通过 ID 次排序不重复、不漏项。
- [FRAME] 新增或删除用户发生在翻页之间时，cursor 行为稳定并有测试定义。
- [FRAME] 默认排除删除用户，筛选可单独查看或包含删除用户。
- [FRAME] 任何请求不能绕过最大 `limit`。
- [FRAME] 页内资源计数没有 N+1 查询。

### 暂停、删除与运行态

- [FRAME] pause 提交后新 Key 交换和 Token 认证都失败为 `user_paused`。
- [FRAME] pause 关闭当前控制通道、数据通道、P2P 和两类隧道运行态。
- [FRAME] pause 不改变 Key `is_active`、Client 注册、Client Token、Tunnel desired state 或 Tunnel 配置。
- [FRAME] pause 后 Tunnel runtime state 不再报告 active，并显示 `owner_paused`。
- [FRAME] pause 期间 Server 重启和 reconcile retry 都不能恢复隧道。
- [FRAME] resume 后 Client 保留 Token 并自动重连，desired running 隧道恢复，desired stopped 隧道不启动。
- [FRAME] delete 填写 `deleted_at`，资产行数完全不变，并显示 `owner_deleted`。
- [FRAME] deleted 用户不能登录、不能重连 Client、不能启动资产。
- [FRAME] 超级管理员仍可查看和清理暂停或删除用户的资产。
- [FRAME] pause/delete 与 Client 重连、数据握手、隧道迁移、P2P 建链并发时最终都 fail closed。

### 控制与数据通道版本矩阵

- [FRAME] `v0.1.15-beta.1` Client 连接当前新 Server：正常用户行为不变。
- [FRAME] `v0.1.15-beta.1` Client 遇到暂停用户：不清 Token，并进入可恢复退避。
- [FRAME] 当前 Client 连接新 Server：正常、暂停、恢复、删除全部覆盖。
- [FRAME] 当前 Client 连接基线旧 Server：现有认证、控制、数据和隧道行为不回归。
- [FRAME] 直连、nginx 和 caddy 都运行同一矩阵。
- [FRAME] 控制通道成功后、数据通道握手前暂停用户时，数据通道不能上线。
- [FRAME] P2P 两端任一用户不正常或所有者不一致时，不生成可用 Grant。

### 活动日志与 SSE

- [FRAME] 用户只能查询自己的活动日志。
- [FRAME] 用户只能收到自己的 SSE Snapshot、增量和恢复事件。
- [FRAME] 管理员全局活动支持用户筛选，用户详情默认固定 Scope。
- [FRAME] 管理员代操作同时保留管理员 Actor 和目标用户 Scope。
- [FRAME] 暂停、恢复、删除、登录拒绝和运行态清理均有结构化活动记录。
- [FRAME] 活动 Payload 不包含密码、Key、Token、Session ID 或完整客户端地址敏感值。

### Web

- [FRAME] 超级管理员登录后到用户列表，普通用户登录后到自己的资源页。
- [FRAME] 用户列表真实分页，不在前端切片全量结果。
- [FRAME] 点击管理员用户能看到全部迁移的现有资产。
- [FRAME] 点击普通用户只加载该用户的拓扑、Client 和隧道。
- [FRAME] 快速切换用户时不展示上一用户缓存。
- [FRAME] pause/delete 后目标用户现有 Web 页面收到 401 并清理本地状态。
- [FRAME] 管理员行不出现可执行的暂停或删除操作。
- [FRAME] 文案使用“活动日志”，不存在通知、已读或收件箱界面。

## P0：Server 回滚观察测试

[FRAME] 这是实现完成后的最高优先级专项测试，但本规划不设计备份、回滚命令、降级 migration、双写补偿或自动恢复方案。

### 风险假设

[INFERRED] 旧 Server 不认识 `users.status`、`deleted_at` 和资源 `owner_user_id`，因此回滚到旧 Server 后很可能重新接受原有 Key/Token，并让暂停或删除用户的资产重新运行。

[INFERRED] 这个风险不能由“Client 协议没有增加 user_id”推出安全；协议不变只说明消息可解析，不说明旧 Server 会执行新用户策略。

### 测试步骤

1. [FRAME] 用 `v0.1.15-beta.1` Server 在隔离测试目录创建管理员 Key、多个 Client、`server_expose` 和 `client_to_client` 隧道并产生流量。
2. [FRAME] 升级到实现多用户的新 Server，完成 migration，确认旧资源全部归超级管理员。
3. [FRAME] 创建普通用户及其资源，分别保留正常、暂停和软删除三组 Fixture。
4. [FRAME] 停止新 Server，在同一份隔离测试数据库上启动 `v0.1.15-beta.1` Server。
5. [FRAME] 记录旧 Server 能否打开数据库、能否认证各组 Client、是否重启暂停或删除用户资产、是否写入新的无 owner 数据。
6. [FRAME] 再次启动新 Server，验证用户状态、删除时间、已有 owner、desired state、活动和历史流量没有损坏。
7. [FRAME] 验证新 Server 是否把旧 Server 期间产生的空 owner 按持续不变量绑定到超级管理员，并检测其他不变量破坏；把实际行为作为发布结论记录。

### 当前通过标准

- [FRAME] 测试必须真实执行并保存结果，不能用 SQLite “通常兼容”替代。
- [FRAME] 新字段和已有资源数据在升级、旧 Server 写入、再次升级后不得静默丢失或错绑用户。
- [FRAME] 再次启动新 Server 后，暂停和删除用户必须重新被门禁，且不能继续承载流量。
- [FRAME] 旧 Server 是否会绕过新用户状态属于必须明确记录的兼容事实；本轮不为它实现产品级回滚保护。

## 完成标准

- [FRAME] 管理员和普通用户使用同一个权威用户目录，现有管理员是受保护超级管理员。
- [FRAME] 用户只有 active/paused 持久化状态，删除只通过 `deleted_at` 表达，不存在到期概念。
- [FRAME] 所有现有资产归超级管理员，所有新资产写入非空用户所有者。
- [FRAME] 普通用户无法观察或操作其他用户的 REST、SSE、Traffic 或 Activity 数据。
- [FRAME] 管理员代操作保留目标 Owner 和真实管理员 Actor。
- [FRAME] pause/delete 会停止全部实际工作但不删除资产、不改原始运行意图。
- [FRAME] Client 控制和数据协议不增加用户字段，跨版本认证失败行为有真实测试证据。
- [FRAME] 管理员 Dashboard 以分页用户列表为入口，用户详情展示网络拓扑、客户端和隧道。
- [FRAME] 产品中没有通知模型，“活动日志”范围、Actor 和保留策略明确。
- [FRAME] Web 不包含 Server API 兼容 fallback。
- [FRAME] 相关 Go 测试、前端 lint/build、统一构建、直连/nginx/caddy E2E、Client 版本矩阵和 P0 Server 回滚观察测试全部完成并有记录。

## 主要代码地图

- [FRAME] `internal/server/migrations/`：用户目录、凭据、Session、所有权和范围字段。
- [FRAME] `internal/server/storage_schema.go`：compatible migration 分类和加载。
- [FRAME] `internal/server/admin_store.go`：初始化、管理员同步、Key、Client、Token 与旧数据导入边界。
- [FRAME] `internal/server/auth_middleware.go`：Principal、Session 和超级管理员中间件。
- [FRAME] `internal/server/server_http.go`：新管理路由和现有资源路由权限。
- [FRAME] `internal/server/control_auth.go`：Key/Token 到用户所有者的解析和控制通道门禁。
- [FRAME] `internal/server/data.go`：数据通道最终门禁。
- [FRAME] `internal/server/session.go`：按用户关闭逻辑 Client 会话和运行态。
- [FRAME] `internal/server/control_loop.go`：legacy 隧道创建门禁。
- [FRAME] `internal/server/unified_tunnel_api.go`：隧道所有权与管理员代操作。
- [FRAME] `internal/server/unified_tunnel_reconcile.go`：用户状态运行门禁和恢复。
- [FRAME] `internal/server/traffic_store.go`：历史流量所有权快照。
- [FRAME] `internal/server/activity_store.go`、`internal/server/activity_api.go`、`internal/server/events.go`：活动日志 Scope 和 SSE 隔离。
- [FRAME] `pkg/protocol/message.go`、`internal/client/client.go`：认证错误兼容行为。
- [FRAME] `web/src/lib/router.ts`、`web/src/lib/auth.ts`、`web/src/lib/api.ts`：前端路由、主体和 API Scope。
- [FRAME] `web/src/hooks/`、`web/src/components/custom/dashboard/`：用户化 Query Key 与三个资源模块。
- [FRAME] `test/e2e/`：直连、反向代理、跨版本、升级与回滚观察验证。
