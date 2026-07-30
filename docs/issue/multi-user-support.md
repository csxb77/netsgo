# 多用户功能设计与实施规划

## 状态

[FRAME] Open / Proposed

## 严重程度

[FRAME] High

## 目标

- [INFERRED] 在保留现有平台管理员控制面的前提下，增加相互隔离的普通用户账户。
- [INFERRED] 普通用户只能查看和管理自己的 API Key、Client、隧道、流量与可见活动。
- [INFERRED] 分别限制每个用户可创建的 `server_expose` 和 `client_to_client` 隧道数量。
- [INFERRED] 支持账户状态与服务有效期；服务到期后停止数据面运行，但保留用户配置和原始运行意图。
- [INFERRED] 管理员可以创建、审核、暂停用户，并调整用户有效期和隧道配额。
- [INFERRED] 现有单管理员部署升级后仍可工作，旧数据继续由管理员管理。

## 非目标

- [INFERRED] 第一版不实现组织、团队、成员邀请或组织级共享资源。
- [INFERRED] 第一版不允许跨用户创建 `client_to_client` 隧道。
- [INFERRED] 第一版不把 NetsGo 改造成多 Server 实例或分布式控制面。
- [INFERRED] 第一版不改变 Client 与 Server 的隧道协议语义；多用户身份和配额属于 Server 管理面能力。

## 当前实现证据

- [KNOWN] Web 登录主体当前是 `admin_users`，角色语义是 `admin` / `viewer`；`admin_sessions` 保存服务端会话。
- [KNOWN] `RequireAuth` 当前只验证 JWT、服务端 Session 和 User-Agent 绑定，不执行资源所有权判定。
- [KNOWN] 多数管理路由，包括 Client、隧道、API Key、Server 配置和安全设置，目前都只经过 `RequireAuth`。
- [KNOWN] `GET /api/clients`、`GET /api/tunnels` 和相关详情接口当前按全局资源工作，不按登录用户过滤。
- [KNOWN] `registered_clients` 与 `api_keys` 当前没有普通用户所有权字段。
- [KNOWN] `tunnels` 已有 `created_by_user_id`，但统一隧道创建路径没有把它作为可靠的资源所有权写入；该字段适合审计，不适合作为所有权来源。
- [KNOWN] 隧道拓扑已经稳定区分为 `server_expose` 和 `client_to_client`，可直接作为两类隧道配额的计数维度。
- [KNOWN] `TunnelStore.addTunnel` 已在 SQLite 事务中完成隧道、资源锁和活动事件写入。
- [KNOWN] 当前 Server 是单机、单实例模型；`TunnelStore` 锁与 SQLite 事务可作为用户配额的并发一致性边界。
- [KNOWN] `traffic_buckets` 当前会保存隧道、Client、拓扑和实际传输方式的历史快照，使资源删除后仍可查询历史流量。
- [KNOWN] SSE 当前按管理员角色决定是否包含活动事件，但普通控制台事件没有用户级过滤。
- [KNOWN] 当前已有 Client 和隧道级带宽限制，但没有用户级隧道数量配额或服务有效期。

## 核心设计决策

### 管理员与普通用户分离

[INFERRED] 保留现有 `admin_users`、`admin_sessions`、MFA 和 Passkey 体系，新增普通用户身份表；不把普通用户直接加入 `admin_users` 并复用 `viewer` 角色。

[INFERRED] 该分离避免普通用户意外进入只做了登录校验、尚未完成租户授权的旧管理接口，也使旧 Server 回滚后无法把普通用户识别成管理员。

[FRAME] 新增普通用户表：

```sql
CREATE TABLE service_users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL
        CHECK (status IN ('pending', 'active', 'suspended')),
    created_at TEXT NOT NULL,
    last_login TEXT
);

CREATE TABLE user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES service_users(id) ON DELETE CASCADE,
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

[INFERRED] `pending` 表示等待管理员批准，`active` 表示账户状态允许使用服务，`suspended` 表示管理员暂停账户。服务是否到期由独立字段判断，不能与账户封禁状态混合。

### 服务有效期与配额

[INFERRED] 第一版使用一张一对一的当前策略表保存服务有效期和配额。

[FRAME] 建议结构：

```sql
CREATE TABLE user_limits (
    user_id TEXT PRIMARY KEY
        REFERENCES service_users(id) ON DELETE CASCADE,
    service_valid_until TEXT,
    max_server_expose_tunnels INTEGER NOT NULL DEFAULT 0
        CHECK (max_server_expose_tunnels >= 0),
    max_client_to_client_tunnels INTEGER NOT NULL DEFAULT 0
        CHECK (max_client_to_client_tunnels >= 0),
    updated_at TEXT NOT NULL,
    updated_by_admin_user_id TEXT NOT NULL DEFAULT ''
);
```

- [INFERRED] `service_valid_until IS NULL` 表示长期有效。
- [INFERRED] 配额值 `0` 表示禁止创建该类隧道，不表示无限。
- [INFERRED] 用户服务有效条件为 `status = 'active'` 且 `service_valid_until IS NULL OR service_valid_until > now`。
- [INFERRED] 用户创建、修改、启动或迁移隧道时必须实时检查服务有效状态。
- [INFERRED] 管理员降低配额至当前用量以下时不自动删除或停止已有隧道，只禁止继续创建会增加用量的隧道。
- [INFERRED] 管理员修改账户状态、有效期或配额时必须写入现有活动审计。

### 只在所有权根和历史快照上保存用户 ID

[INFERRED] 不给所有关联表机械地增加 `user_id`。权威所有权只保存在需要独立授权或配额统计的资源根上；删除父资源后仍需保留归属的历史表保存用户快照。

[FRAME] 第一版新增字段：

```sql
ALTER TABLE api_keys
    ADD COLUMN owner_user_id TEXT REFERENCES service_users(id);

ALTER TABLE registered_clients
    ADD COLUMN owner_user_id TEXT REFERENCES service_users(id);

ALTER TABLE tunnels
    ADD COLUMN owner_user_id TEXT REFERENCES service_users(id);

ALTER TABLE traffic_buckets
    ADD COLUMN owner_user_id TEXT;

ALTER TABLE activity_events
    ADD COLUMN scope_user_id TEXT;
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
    ON activity_events(scope_user_id, occurred_at_ns, id);
```

[INFERRED] 字段语义必须固定：

| 字段 | 语义 |
|---|---|
| `owner_user_id` | [INFERRED] 资源属于哪个普通用户；用于授权、过滤和配额。 |
| `created_by_user_id` | [INFERRED] 谁执行了隧道创建；用于审计，不能替代所有权。 |
| `owner_client_id` | [KNOWN] 哪个 Client 是隧道业务所有端；属于隧道拓扑语义，不能替代用户所有权。 |
| `scope_user_id` | [INFERRED] 活动事件可被哪个普通用户读取；`NULL` 表示仅属于全局或管理员作用域。 |

[INFERRED] 下列表不重复增加用户所有权：

| 表 | 所有权推导方式 |
|---|---|
| `client_stats` | [INFERRED] 通过 `client_id -> registered_clients.owner_user_id` 推导。 |
| `client_disk_partitions` | [INFERRED] 通过 `client_id -> registered_clients.owner_user_id` 推导。 |
| `client_tokens` | [INFERRED] 通过 `client_id` 或 `key_id` 推导；避免第三份可漂移所有权。 |
| `api_key_permissions` | [INFERRED] 通过 `api_key_id -> api_keys.owner_user_id` 推导。 |
| `tunnel_resource_locks` | [INFERRED] 通过 `tunnel_id -> tunnels.owner_user_id` 推导。 |
| `activity_event_clients` | [INFERRED] 通过所属活动事件的 `scope_user_id` 推导。 |
| `activity_event_tunnels` | [INFERRED] 通过所属活动事件的 `scope_user_id` 推导。 |
| `allowed_ports` | [KNOWN] Server 全局策略，不属于普通用户。 |
| `server_config` | [KNOWN] Server 全局配置，不属于普通用户。 |

## 请求身份与授权模型

### 统一请求主体

[INFERRED] HTTP 请求上下文应从管理员专用的 `SessionInfo` 抽象为可表达管理员和普通用户的统一主体。

[FRAME] 建议类型：

```go
type PrincipalKind string

const (
    PrincipalAdmin PrincipalKind = "admin"
    PrincipalUser  PrincipalKind = "user"
)

type RequestPrincipal struct {
    Kind      PrincipalKind
    ID        string
    Username  string
    Role      string
    SessionID string
}
```

[INFERRED] 用户 JWT 应携带主体类型和 Session ID；缺少主体类型的现有 JWT 只能按管理员 Session 路径解析，以兼容升级前已登录的管理员。

[INFERRED] 旧 Server 即使忽略新 JWT 中的主体类型，也会在 `admin_sessions` 中找不到普通用户 Session，从而拒绝普通用户令牌；不能让普通用户 Session ID 与管理员 Session 共享查询空间。

### 中间件边界

[FRAME] 建议中间件职责：

```text
RequirePrincipal      验证管理员或普通用户会话并注入 RequestPrincipal
RequireAdmin          仅允许平台管理员
RequireActiveService  普通用户必须处于有效服务期；管理员走显式管理策略
```

- [INFERRED] `/api/admin/*` 必须统一使用 `RequireAdmin`，不能继续只做 `RequireAuth`。
- [INFERRED] 普通资源查询允许管理员查看全部资源，普通用户只能查看 `owner_user_id = principal.ID` 的资源。
- [INFERRED] 普通资源变更必须同时验证主体、资源所有权、用户状态、服务有效期和配额。
- [INFERRED] 普通用户访问其他用户资源时返回 `404`，避免通过 ID 枚举资源是否存在。
- [INFERRED] 管理员全局查询与用户范围查询应使用不同的存储方法，不能约定空 `userID` 代表全局权限。

## API 与资源所有权

### 用户账户

[FRAME] 建议增加管理员接口：

```text
GET    /api/admin/users
POST   /api/admin/users
GET    /api/admin/users/{user_id}
PUT    /api/admin/users/{user_id}
PUT    /api/admin/users/{user_id}/limits
POST   /api/admin/users/{user_id}/reset-password
POST   /api/admin/users/{user_id}/revoke-sessions
```

[FRAME] 建议增加普通用户认证接口：

```text
POST   /api/user/auth/register
POST   /api/user/auth/login
POST   /api/user/auth/logout
GET    /api/user/me
```

[INFERRED] 注册策略应作为 Server 全局配置显式选择 `closed`、`approval_required` 或 `open`，默认使用 `closed`，避免升级后自动开放公共注册。

[INFERRED] `approval_required` 创建 `pending` 用户，管理员批准后转为 `active`；`open` 创建时直接进入 `active`，但仍必须有默认有效期与默认配额。

[INFERRED] 用户注册、登录和密码重置需要独立限流，不复用管理员登录限流的身份和错误统计。

### API Key 与 Client 注册

[INFERRED] 普通用户创建 API Key 时，Server 从当前请求主体写入 `api_keys.owner_user_id`；客户端提交内容不得包含或覆盖所有者字段。

[INFERRED] 通过 API Key 注册 Client 时，Server 从 Key 读取 `owner_user_id`，检查用户状态和服务有效期，并把相同所有者写入 `registered_clients.owner_user_id`。

[INFERRED] 已存在 `install_id` 再次交换令牌时，必须验证现有 Client 与当前 API Key 属于同一用户；不同用户不能通过同一个 `install_id` 接管 Client。

[INFERRED] Client Token 不重复保存 `owner_user_id`，每次控制通道认证通过 `client_id` 或 `key_id` 解析当前用户，并检查用户服务状态。

[FRAME] 普通用户 Key 接口建议使用独立路径：

```text
GET    /api/keys
POST   /api/keys
PUT    /api/keys/{key_id}/{action}
DELETE /api/keys/{key_id}
```

[INFERRED] 现有 `/api/admin/keys` 保持管理员全局管理语义，不能根据可选参数隐式切换为普通用户作用域。

### Client

[INFERRED] `GET /api/clients` 对管理员返回全部 Client，对普通用户只返回自己的 Client。

[INFERRED] Client 详情、改名、删除、版本检查、流量和带宽设置都必须先按当前主体加载资源；不能先全局加载后仅在前端隐藏。

[INFERRED] 删除用户时不能隐式删除在线 Client、隧道和历史流量；第一版应要求管理员先暂停用户，再显式处理资源，避免级联删除运行态数据。

### 隧道

[INFERRED] 创建隧道时，`owner_user_id` 必须由当前普通用户主体或管理员明确选择的目标用户决定，不能来自请求体中的任意字段。

[INFERRED] 普通用户创建 `server_expose` 隧道时，Target Client 必须属于该用户。

[INFERRED] 普通用户创建 `client_to_client` 隧道时，Ingress Client 和 Target Client 必须都属于该用户。

[INFERRED] 第一版管理员也不应通过普通隧道创建接口连接两个不同用户的 Client；跨用户连接需要未来单独设计双向授权和撤销模型。

[INFERRED] 隧道列表、详情、更新、停止、恢复、迁移和删除均须使用 `owner_user_id` 授权。

[INFERRED] 目标 Client 迁移必须验证新目标 Client 与隧道属于同一用户；`client_to_client` 迁移还必须验证未迁移的另一端仍属于同一用户。

[INFERRED] legacy Client 发起的 `MsgTypeProxyCreate` 路径也必须从已认证 Client 推导用户，并执行相同服务状态、所有权和配额规则；只保护 REST API 会留下绕过路径。

### 流量与活动

[INFERRED] 新流量桶写入时从隧道的 `owner_user_id` 保存归属快照；隧道或 Client 删除后，普通用户仍可查询自己的历史流量。

[INFERRED] 普通用户流量查询必须强制使用当前主体的 `owner_user_id` 条件，不能接受请求参数切换到其他用户。

[INFERRED] 用户资源活动写入 `scope_user_id`；全局管理员操作、安全事件和无法归属的旧事件使用 `NULL`，仅管理员可见。

[INFERRED] SSE 必须在发布前按主体过滤 Client、隧道、流量和活动事件；过滤不能只发生在首次 HTTP 查询。

## 配额语义与原子性

### 计数规则

- [INFERRED] `max_server_expose_tunnels` 只统计该用户 `topology = 'server_expose'` 且尚未删除的隧道。
- [INFERRED] `max_client_to_client_tunnels` 只统计该用户 `topology = 'client_to_client'` 且尚未删除的隧道。
- [INFERRED] 已停止、离线、错误或等待恢复的隧道仍占用配额；只有删除隧道才释放名额。
- [INFERRED] 更新不改变拓扑时不增加配额使用量；如果 API 允许改变拓扑，则必须在同一事务中同时检查旧、新配额。
- [INFERRED] 管理员代用户创建隧道时默认仍消耗该用户配额；超额只能通过管理员显式提高配额解决，不提供隐藏绕过。

### 原子检查

[INFERRED] 配额读取、当前数量统计、隧道写入、资源锁写入和活动事件写入必须处于同一个 `TunnelStore` 锁与 SQLite 事务中。

[FRAME] 存储入口应表达用户作用域：

```go
func (s *TunnelStore) AddTunnelForUser(
    userID string,
    tunnel StoredTunnel,
    actor ActivityActor,
) (int64, error)
```

[FRAME] 事务内逻辑：

```text
1. 加载 service_users 与 user_limits
2. 检查 status 和 service_valid_until
3. 按 owner_user_id + topology 统计当前隧道数
4. 超额则回滚并返回稳定配额错误
5. 写入 tunnels.owner_user_id 和 created_by_user_id
6. 写入 tunnel_resource_locks
7. 写入 activity_events.scope_user_id
8. 提交事务
```

[INFERRED] 不能在 HTTP Handler 中先查询数量、再调用现有独立写事务；两个并发请求可能同时看到未满配额并共同越界。

[FRAME] 建议错误响应：

```json
{
  "success": false,
  "code": "tunnel_quota_exceeded",
  "quota": "server_expose_tunnels",
  "current": 3,
  "limit": 3
}
```

[INFERRED] 另一个配额名固定为 `client_to_client_tunnels`，前后端不得根据文案推断配额类型。

## 服务到期语义

### 不覆盖用户原始运行意图

[INFERRED] 服务到期不能把所有隧道的 `desired_state` 永久改为 `stopped`，否则续期后无法判断哪些隧道原本应恢复。

[FRAME] 到期状态应表达为：

```text
desired_state = running       保留用户原始意图
service       = expired       外部策略禁止运行
runtime_state = offline/error 当前不可承载流量
issue.code    = service_expired
```

[INFERRED] `service_expired` 属于 Server 自己负责的账户与运行态策略，不是目标服务健康检查。

### 到期门禁

[INFERRED] 服务到期后执行以下规则：

1. [INFERRED] 用户仍可登录并只读查看账户、资源、配额和到期信息。
2. [INFERRED] 创建、更新、启动、迁移和签发 API Key 等变更返回稳定的 `service_expired` 错误。
3. [INFERRED] 新的 Client 控制通道认证被拒绝。
4. [INFERRED] 已在线的该用户 Client 会话被主动关闭。
5. [INFERRED] 该用户的 `server_expose` 和 `client_to_client` 隧道运行态被卸载。
6. [INFERRED] 隧道配置、Client 注册记录、历史流量和原始 `desired_state` 保留。
7. [INFERRED] Server 启动恢复和所有 reconcile 入口在配置运行态前再次检查服务有效状态。

[INFERRED] 只在 API 层检查会遗漏现有运行态和 Client 重连；只依赖周期任务会留下到期到扫描之间的继续使用窗口。认证入口、变更入口和 reconcile 必须各自 fail closed。

### 到期协调器与续期恢复

[INFERRED] Server 应增加分钟级用户有效期协调器，扫描刚到期或状态变化的用户，并串行触发 Client 断开和隧道卸载。

[INFERRED] 管理员延长有效期或把用户恢复为 `active` 后，Server 清除该用户隧道的 `service_expired` 问题，并为 `desired_state = running` 的隧道调度 reconcile。

[INFERRED] 续期恢复必须复用现有统一 reconcile，不另建一套直接启动 TCP、UDP、HTTP 或 SOCKS5 运行态的路径。

## 存储层接口边界

[INFERRED] 授权不能只在 HTTP Handler 中完成；存储或服务层入口必须显式携带用户作用域，防止后台任务、迁移、SSE 或未来调用者绕过授权。

[FRAME] 建议增加用户作用域接口：

```go
ListClientsForUser(userID string)
GetClientForUser(userID, clientID string)
DeleteClientForUser(userID, clientID string)

ListTunnelsForUser(userID string)
GetTunnelForUser(userID, tunnelID string)
AddTunnelForUser(userID string, tunnel StoredTunnel, actor ActivityActor)
ReplaceTunnelForUser(userID, tunnelID string, tunnel StoredTunnel, actor ActivityActor)
RemoveTunnelForUser(userID, tunnelID string, actor ActivityActor)

ListAPIKeysForUser(userID string)
QueryTrafficForUser(userID string, query TrafficQuery)
QueryActivityForUser(userID string, query ActivityQuery)
```

[INFERRED] 管理员全局方法保留明确的 `All` 或 `Admin` 语义；不得通过传空字符串、特殊 UUID 或布尔开关绕过用户范围。

## 数据迁移与回滚

- [INFERRED] 新增 `owner_user_id` 和 `scope_user_id` 第一阶段允许 `NULL`。
- [INFERRED] 升级前已有的 API Key、Client、隧道、流量和活动保持 `NULL`，表示平台管理员管理的遗留资源，普通用户不可见。
- [INFERRED] 新代码为普通用户创建资源时必须写入非空 `owner_user_id`；缺失所有者应使普通用户创建事务失败。
- [INFERRED] 不把旧资源自动归入某个可登录普通用户，避免该用户获得全部历史资源。
- [INFERRED] 管理员可以通过未来显式“转移资源”操作把遗留 Client 及其隧道归入某个普通用户；转移必须是事务性操作并重新验证配额和 Client-to-Client 两端所有权。
- [INFERRED] 迁移文件应保持现有可嵌入、可解析格式，并补充 fresh DB、旧 DB migration 和 schema validation 测试。
- [INFERRED] 新增普通用户表而不改写 `admin_users`，可以降低 Server 回滚时的管理员认证风险。
- [INFERRED] 数据库回滚是否允许旧 Server 写入新增列为 `NULL` 的资源，必须通过现有 upgrade/rollback E2E 验证，不能仅根据 SQLite 兼容性推断。

## 前端规划

### 普通用户视图

- [INFERRED] 展示当前用户拥有的 Client 和隧道，不加载全局列表后再在浏览器过滤。
- [INFERRED] 展示 `server_expose` 与 `client_to_client` 的当前用量和上限。
- [INFERRED] 展示账户状态、服务有效期和到期后的只读说明。
- [INFERRED] 管理自己的 API Key。
- [INFERRED] 查看自己的流量与可见活动。
- [INFERRED] 隐藏并在服务端禁止 Server 配置、全局限流、管理员安全设置和其他用户资源。

### 管理员视图

- [INFERRED] 增加用户列表、搜索、创建、审核、暂停和恢复操作。
- [INFERRED] 增加有效期和两类隧道配额编辑。
- [INFERRED] 显示每个用户当前资源用量与超额状态。
- [INFERRED] 支持进入某个用户的资源视图，但所有代操作仍记录真实管理员 `created_by_user_id` 或活动 Actor。
- [INFERRED] 支持重置用户密码、撤销用户 Session 和主动断开用户 Client。

[INFERRED] 前端继续使用 TanStack Router Hash 模式、`web/src/lib/api.ts` 和 TanStack Query；不能为普通用户另建平行的裸 `fetch` 或服务端状态副本。

## 实施阶段

### 阶段一：身份与管理员边界

1. [INFERRED] 新增 `service_users`、`user_sessions` 和 `user_limits` migration。
2. [INFERRED] 增加普通用户注册、登录、退出和当前用户接口。
3. [INFERRED] 增加管理员用户管理接口。
4. [INFERRED] 引入统一 `RequestPrincipal`。
5. [INFERRED] 将 `/api/admin/*` 全部收紧到 `RequireAdmin`。

### 阶段二：资源所有权与隔离

1. [INFERRED] 为 API Key、Client 和隧道增加 `owner_user_id`。
2. [INFERRED] 为历史流量和活动增加用户归属快照。
3. [INFERRED] 将 Client、隧道、API Key、流量和活动查询改为用户作用域。
4. [INFERRED] 将更新、停止、恢复、迁移、删除和 legacy Client 创建路径接入相同所有权检查。
5. [INFERRED] 对 SSE 进行用户级事件过滤。
6. [INFERRED] 禁止跨用户 `client_to_client`。

### 阶段三：隧道配额

1. [INFERRED] 在隧道创建事务内执行两类拓扑配额检查。
2. [INFERRED] 为更新和迁移补充配额与所有权复核。
3. [INFERRED] 增加稳定错误代码和前端用量展示。
4. [INFERRED] 增加并发创建测试，证明不能越过上限。

### 阶段四：服务有效期

1. [INFERRED] 在用户变更接口、API Key 签发、Client 认证和隧道 reconcile 增加有效期门禁。
2. [INFERRED] 增加到期协调器并卸载两类隧道运行态。
3. [INFERRED] 保留 `desired_state` 和配置。
4. [INFERRED] 管理员续期后触发现有统一 reconcile 恢复。
5. [INFERRED] 增加启动恢复、在线到期和续期恢复测试。

### 阶段五：前端与系统验证

1. [INFERRED] 完成普通用户和管理员双视角 UI。
2. [INFERRED] 覆盖权限错误、配额错误和到期错误文案。
3. [INFERRED] 运行前端构建、相关 Go 包测试和多用户系统 E2E。
4. [INFERRED] 运行现有 nginx、caddy、Client-to-Client、兼容和升级回滚路径，确认多用户管理面改动没有破坏数据面。

## 关键测试矩阵

### 身份与隔离

- [INFERRED] 用户 A 看不到用户 B 的 Client、隧道、API Key、流量、活动和 SSE 事件。
- [INFERRED] 用户 A 即使知道用户 B 的资源 ID，也无法读取、修改、停止、迁移或删除该资源。
- [INFERRED] 越权访问返回 `404`，不泄露目标资源是否存在。
- [INFERRED] 普通用户无法访问任何 `/api/admin/*` 路由。
- [INFERRED] 管理员仍能查看和管理全局资源。
- [INFERRED] 升级前 `owner_user_id IS NULL` 的遗留资源只对管理员可见。

### API Key 与 Client

- [INFERRED] 用户创建的 API Key 自动绑定当前用户，客户端不能伪造所有者。
- [INFERRED] 通过该 Key 注册的 Client 自动继承同一用户。
- [INFERRED] 不同用户不能通过相同 `install_id` 接管已有 Client。
- [INFERRED] 暂停或到期用户的 Key 不能注册新 Client，也不能让旧 Client 重连。

### 隧道与配额

- [INFERRED] `server_expose` 和 `client_to_client` 分别计数，互不挤占额度。
- [INFERRED] 停止、离线和错误隧道仍占用额度，删除后释放。
- [INFERRED] 两个并发创建请求不能越过同一用户的配额。
- [INFERRED] 不同用户的配额互不影响。
- [INFERRED] 两端 Client 属于不同用户时，`client_to_client` 创建失败。
- [INFERRED] legacy Client 创建路径不能绕过配额和所有权。

### 服务有效期

- [INFERRED] 到期用户仍可登录并只读查看自己的资源。
- [INFERRED] 到期后所有资源变更和 Key 签发失败并返回 `service_expired`。
- [INFERRED] 到期后新 Client 认证失败，现有 Client 会话被关闭。
- [INFERRED] 到期后 `server_expose` 与 `client_to_client` 都停止承载新流量。
- [INFERRED] 到期不修改隧道原始 `desired_state`。
- [INFERRED] 续期后原本 `desired_state = running` 的隧道通过 reconcile 恢复。
- [INFERRED] Server 重启时不会恢复到期用户的运行态。

### 兼容与回滚

- [INFERRED] 旧 Client 连接新 Server 时，共享协议行为保持不变。
- [INFERRED] 新 Server 迁移现有数据库后，管理员认证和遗留资源不丢失。
- [INFERRED] Server 升级、回滚和再次升级后，新增 nullable 所有权字段不会破坏旧资源。
- [INFERRED] nginx、caddy 和直连路径上的 WebSocket、HTTP 隧道与 Client-to-Client 数据面仍通过现有 E2E。

## 主要代码位置

- [KNOWN] `internal/server/migrations/`：用户、Session、配额、所有权和历史快照 schema。
- [KNOWN] `internal/server/storage_schema.go`：migration 分类、加载与解析。
- [KNOWN] `internal/server/admin_store.go`：管理员、API Key、Client 和 Client Token 存储；需要拆出或扩展普通用户存储边界。
- [KNOWN] `internal/server/auth_middleware.go`：统一请求主体和管理员/用户授权中间件。
- [KNOWN] `internal/server/server_http.go`：管理路由权限收紧和用户路由注册。
- [KNOWN] `internal/server/unified_tunnel_api.go`：隧道创建、更新、迁移、删除和用户所有权校验。
- [KNOWN] `internal/server/store.go`：事务内配额、隧道所有权和资源锁。
- [KNOWN] `internal/server/control_auth.go`：Client 认证时解析用户和服务有效期。
- [KNOWN] `internal/server/control_loop.go`：legacy Client 创建路径的用户配额门禁。
- [KNOWN] `internal/server/unified_tunnel_reconcile.go`：服务到期运行态门禁与续期恢复。
- [KNOWN] `internal/server/traffic_store.go`：用户流量归属快照和用户作用域查询。
- [KNOWN] `internal/server/activity_store.go`、`internal/server/events.go`：用户活动和 SSE 隔离。
- [KNOWN] `web/src/lib/api.ts`、`web/src/stores/auth-store.ts`、`web/src/lib/router.ts`：普通用户认证、路由和 API。
- [KNOWN] `web/src/components/custom/client/`、`web/src/components/custom/tunnel/`：用户作用域资源与配额展示。
- [KNOWN] `test/e2e/`：多用户隔离、到期、反向代理、兼容和升级回滚验证。

## 完成标准

- [INFERRED] 管理员与普通用户身份边界明确，普通用户无法进入管理员接口。
- [INFERRED] 所有 Client、API Key、隧道、流量、活动和 SSE 路径都具备服务端用户隔离。
- [INFERRED] 两类隧道配额在并发创建下仍保持原子，不存在 REST 或 legacy Client 绕过路径。
- [INFERRED] 服务到期能够阻止认证和变更、卸载现有运行态，并在续期后恢复原本应运行的隧道。
- [INFERRED] 遗留管理员资源、现有 Client 协议、前端嵌入构建和直连/nginx/caddy 数据面保持可用。
- [INFERRED] 相关 Go 测试、前端构建、多用户系统 E2E、兼容和升级回滚验证全部通过。
