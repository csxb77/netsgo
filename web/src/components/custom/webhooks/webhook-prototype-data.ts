export type WebhookMethod = 'GET' | 'POST';

export type WebhookEventKey =
  | 'client.online'
  | 'client.offline'
  | 'tunnel.stopped'
  | 'tunnel.resumed'
  | 'tunnel.runtime_changed'
  | 'tunnel.runtime_error'
  | 'tunnel.runtime_recovered'
  | 'p2p.checking'
  | 'p2p.connected'
  | 'p2p.failed'
  | 'p2p.fallback'
  | 'p2p.session_closed';

export type WebhookTargetKind = 'client' | 'tunnel';
export type WebhookEventFamily = WebhookTargetKind | 'p2p';
export type WebhookTemplateSurface = 'url' | 'header' | 'body';
export type WebhookTemplateValue = string | number | boolean | null | Record<string, unknown> | unknown[];

export interface WebhookEventOption {
  key: WebhookEventKey;
  targetKind: WebhookTargetKind;
  family: WebhookEventFamily;
}

export const WEBHOOK_EVENT_OPTIONS: WebhookEventOption[] = [
  { key: 'client.online', targetKind: 'client', family: 'client' },
  { key: 'client.offline', targetKind: 'client', family: 'client' },
  { key: 'tunnel.stopped', targetKind: 'tunnel', family: 'tunnel' },
  { key: 'tunnel.resumed', targetKind: 'tunnel', family: 'tunnel' },
  { key: 'tunnel.runtime_changed', targetKind: 'tunnel', family: 'tunnel' },
  { key: 'tunnel.runtime_error', targetKind: 'tunnel', family: 'tunnel' },
  { key: 'tunnel.runtime_recovered', targetKind: 'tunnel', family: 'tunnel' },
  { key: 'p2p.checking', targetKind: 'tunnel', family: 'p2p' },
  { key: 'p2p.connected', targetKind: 'tunnel', family: 'p2p' },
  { key: 'p2p.failed', targetKind: 'tunnel', family: 'p2p' },
  { key: 'p2p.fallback', targetKind: 'tunnel', family: 'p2p' },
  { key: 'p2p.session_closed', targetKind: 'tunnel', family: 'p2p' },
];

const CLIENT_EVENTS = WEBHOOK_EVENT_OPTIONS.filter((event) => event.family === 'client').map((event) => event.key);
const TUNNEL_EVENTS = WEBHOOK_EVENT_OPTIONS.filter((event) => event.family === 'tunnel').map((event) => event.key);
const P2P_EVENTS = WEBHOOK_EVENT_OPTIONS.filter((event) => event.family === 'p2p').map((event) => event.key);

export interface WebhookTargetOption {
  id: string;
  name: string;
  detail: string;
  unavailable?: boolean;
}

export const WEBHOOK_CLIENT_OPTIONS: WebhookTargetOption[] = [
  { id: 'client_hk_edge_01', name: '香港节点 01', detail: 'hk-edge-01 · online' },
  { id: 'client_sz_render_03', name: '深圳渲染节点 03', detail: 'sz-render-03 · online' },
  { id: 'client_tokyo_backup', name: '东京备份节点', detail: 'tokyo-backup · offline' },
  { id: 'client_legacy_removed', name: '旧版边缘节点', detail: 'legacy-edge · removed', unavailable: true },
];

export const WEBHOOK_TUNNEL_OPTIONS: WebhookTargetOption[] = [
  { id: 'tunnel_crm_https', name: 'CRM HTTPS', detail: 'HTTPS · 香港节点 01' },
  { id: 'tunnel_wms_tcp', name: 'WMS TCP', detail: 'TCP · 深圳渲染节点 03' },
  { id: 'tunnel_assets_p2p', name: 'Assets P2P', detail: 'P2P · 香港节点 01 ↔ 深圳渲染节点 03' },
  { id: 'tunnel_legacy_removed', name: '旧版 API TCP', detail: 'TCP · removed', unavailable: true },
];

export interface WebhookHeader {
  id: string;
  key: string;
  value: string;
}

export interface WebhookPrototype {
  id: string;
  name: string;
  enabled: boolean;
  targetKind: WebhookTargetKind;
  targetMode: 'all' | 'selected';
  targetIds: string[];
  method: WebhookMethod;
  url: string;
  headers: WebhookHeader[];
  body: string;
  events: WebhookEventKey[];
  calls24h: number;
  lastStatus: 'success' | 'failed' | 'retrying' | 'idle';
  consecutiveFailures: number;
  lastCalledAt: string | null;
}

const DEFAULT_WEBHOOK_BODY = `{
  "schema_version": 1,
  "delivery": {
    "id": "{{delivery.id}}",
    "attempt": "{{delivery.attempt}}"
  },
  "event": {
    "id": "{{event.id}}",
    "type": "{{event.type}}",
    "occurred_at": "{{event.occurred_at}}",
    "severity": "{{event.severity}}",
    "reason_code": "{{event.reason_code}}",
    "expected": "{{event.expected}}",
    "data": "{{event.data}}"
  },
  "subjects": {
    "clients": "{{subjects.clients}}",
    "tunnels": "{{subjects.tunnels}}"
  },
  "matched_target_ids": "{{match.target_ids}}"
}`;

export const DEFAULT_CLIENT_WEBHOOK_BODY = DEFAULT_WEBHOOK_BODY;
export const DEFAULT_TUNNEL_WEBHOOK_BODY = DEFAULT_WEBHOOK_BODY;
export const DEFAULT_P2P_WEBHOOK_BODY = DEFAULT_WEBHOOK_BODY;

export const WEBHOOK_PROTOTYPES: WebhookPrototype[] = [
  {
    id: 'wh_client_presence',
    name: '客户端上下线通知',
    enabled: true,
    targetKind: 'client',
    targetMode: 'all',
    targetIds: [],
    method: 'POST',
    url: 'https://hooks.example.com/netsgo/activity',
    headers: [
      { id: 'header-client-content', key: 'Content-Type', value: 'application/json' },
      { id: 'header-client-auth', key: 'Authorization', value: 'Bearer demo-client-token' },
    ],
    body: DEFAULT_CLIENT_WEBHOOK_BODY,
    events: ['client.online', 'client.offline'],
    calls24h: 184,
    lastStatus: 'success',
    consecutiveFailures: 0,
    lastCalledAt: '2026-08-21T10:42:16+08:00',
  },
  {
    id: 'wh_tunnel_alerts',
    name: '隧道异常告警',
    enabled: true,
    targetKind: 'tunnel',
    targetMode: 'selected',
    targetIds: ['tunnel_crm_https', 'tunnel_wms_tcp'],
    method: 'GET',
    url: 'https://status.example.net/notify?event={{event.type}}&tunnel={{tunnel.id}}&state={{tunnel.runtime_state}}',
    headers: [{ id: 'header-tunnel-token', key: 'X-Webhook-Token', value: 'demo-tunnel-token' }],
    body: '',
    events: ['tunnel.runtime_changed', 'tunnel.runtime_error', 'tunnel.runtime_recovered'],
    calls24h: 31,
    lastStatus: 'success',
    consecutiveFailures: 0,
    lastCalledAt: '2026-08-21T09:58:44+08:00',
  },
  {
    id: 'wh_p2p_state',
    name: 'P2P 状态通知',
    enabled: false,
    targetKind: 'tunnel',
    targetMode: 'all',
    targetIds: [],
    method: 'POST',
    url: 'https://api.example.org/events/network',
    headers: [{ id: 'header-p2p-content', key: 'Content-Type', value: 'application/json' }],
    body: DEFAULT_P2P_WEBHOOK_BODY,
    events: ['p2p.connected', 'p2p.failed', 'p2p.fallback', 'p2p.session_closed'],
    calls24h: 0,
    lastStatus: 'idle',
    consecutiveFailures: 0,
    lastCalledAt: null,
  },
];

export const EMPTY_WEBHOOK: WebhookPrototype = {
  id: 'wh_new',
  name: '',
  enabled: false,
  targetKind: 'client',
  targetMode: 'selected',
  targetIds: [],
  method: 'POST',
  url: '',
  headers: [{ id: 'header-content-type', key: 'Content-Type', value: 'application/json' }],
  body: DEFAULT_CLIENT_WEBHOOK_BODY,
  events: [],
  calls24h: 0,
  lastStatus: 'idle',
  consecutiveFailures: 0,
  lastCalledAt: null,
};

export interface WebhookEventFixture {
  event: WebhookEventKey;
  values: Record<string, WebhookTemplateValue>;
}

interface FixtureOptions {
  event: WebhookEventKey;
  severity: 'debug' | 'info' | 'warning' | 'error';
  summary: string;
  reasonCode: string;
  expected: boolean;
  data: Record<string, unknown>;
  clients?: Array<{ id: string; name: string; status: string }>;
  tunnels?: Array<{ id: string; name: string; runtime_state: string }>;
  matchedTargetIds: string[];
  p2pState?: string;
  p2pReason?: string;
}

function fixture(options: FixtureOptions): WebhookEventFixture {
  const clients = options.clients ?? [];
  const tunnels = options.tunnels ?? [];
  const values: Record<string, WebhookTemplateValue> = {
    'delivery.id': `dlv_sample_${options.event.replaceAll('.', '_')}`,
    'delivery.attempt': 1,
    'event.id': `evt_sample_${options.event.replaceAll('.', '_')}`,
    'event.type': options.event,
    'event.category': options.event.split('.')[0],
    'event.severity': options.severity,
    'event.occurred_at': '2026-08-21T10:42:16+08:00',
    'event.summary': options.summary,
    'event.reason_code': options.reasonCode,
    'event.expected': options.expected,
    'event.data': options.data,
    'subjects.clients': clients,
    'subjects.tunnels': tunnels,
    'subjects.client_ids_csv': clients.map((client) => client.id).join(','),
    'subjects.tunnel_ids_csv': tunnels.map((tunnel) => tunnel.id).join(','),
    'match.target_ids': options.matchedTargetIds,
    'match.target_ids_csv': options.matchedTargetIds.join(','),
    'webhook.id': 'wh_client_presence',
    'webhook.name': '客户端上下线通知',
  };
  if (clients.length === 1) {
    values['client.id'] = clients[0].id;
    values['client.name'] = clients[0].name;
    values['client.status'] = clients[0].status;
  }
  if (tunnels.length === 1 && options.event.startsWith('tunnel.')) {
    values['tunnel.id'] = tunnels[0].id;
    values['tunnel.name'] = tunnels[0].name;
    values['tunnel.runtime_state'] = tunnels[0].runtime_state;
  }
  if (options.p2pState) values['p2p.state'] = options.p2pState;
  if (options.p2pReason) values['p2p.reason'] = options.p2pReason;
  return { event: options.event, values };
}

const HK_CLIENT = { id: 'client_hk_edge_01', name: '香港节点 01', status: 'online' };
const SZ_CLIENT = { id: 'client_sz_render_03', name: '深圳渲染节点 03', status: 'online' };
const CRM_TUNNEL = { id: 'tunnel_crm_https', name: 'CRM HTTPS', runtime_state: 'exposed' };
const ASSETS_TUNNEL = { id: 'tunnel_assets_p2p', name: 'Assets P2P', runtime_state: 'p2p_connected' };

export const WEBHOOK_EVENT_FIXTURES: Record<WebhookEventKey, WebhookEventFixture> = {
  'client.online': fixture({ event: 'client.online', severity: 'info', summary: '香港节点 01 已上线', reasonCode: 'connected', expected: true, data: { status: 'online' }, clients: [HK_CLIENT], matchedTargetIds: [HK_CLIENT.id] }),
  'client.offline': fixture({ event: 'client.offline', severity: 'warning', summary: '香港节点 01 意外离线', reasonCode: 'connection_lost', expected: false, data: { status: 'offline' }, clients: [{ ...HK_CLIENT, status: 'offline' }], matchedTargetIds: [HK_CLIENT.id] }),
  'tunnel.stopped': fixture({ event: 'tunnel.stopped', severity: 'info', summary: 'CRM HTTPS 已停止', reasonCode: 'user_disabled', expected: true, data: { runtime_state: 'stopped' }, tunnels: [{ ...CRM_TUNNEL, runtime_state: 'stopped' }], matchedTargetIds: [CRM_TUNNEL.id] }),
  'tunnel.resumed': fixture({ event: 'tunnel.resumed', severity: 'info', summary: 'CRM HTTPS 已恢复运行', reasonCode: 'user_enabled', expected: true, data: { runtime_state: 'exposed' }, tunnels: [CRM_TUNNEL], matchedTargetIds: [CRM_TUNNEL.id] }),
  'tunnel.runtime_changed': fixture({ event: 'tunnel.runtime_changed', severity: 'debug', summary: 'CRM HTTPS 运行状态已改变', reasonCode: 'runtime_transition', expected: true, data: { before: 'provisioning', after: 'exposed', revision: 18 }, tunnels: [CRM_TUNNEL], matchedTargetIds: [CRM_TUNNEL.id] }),
  'tunnel.runtime_error': fixture({ event: 'tunnel.runtime_error', severity: 'error', summary: 'CRM HTTPS 运行异常', reasonCode: 'expose_failed', expected: false, data: { runtime_state: 'error', error: 'listen tcp: address already in use' }, tunnels: [{ ...CRM_TUNNEL, runtime_state: 'error' }], matchedTargetIds: [CRM_TUNNEL.id] }),
  'tunnel.runtime_recovered': fixture({ event: 'tunnel.runtime_recovered', severity: 'info', summary: 'CRM HTTPS 已从异常中恢复', reasonCode: 'runtime_recovered', expected: true, data: { before: 'error', after: 'exposed' }, tunnels: [CRM_TUNNEL], matchedTargetIds: [CRM_TUNNEL.id] }),
  'p2p.checking': fixture({ event: 'p2p.checking', severity: 'debug', summary: '正在检查 P2P 直连条件', reasonCode: 'candidate_check', expected: true, data: { state: 'checking' }, clients: [HK_CLIENT, SZ_CLIENT], tunnels: [ASSETS_TUNNEL, { ...CRM_TUNNEL, runtime_state: 'p2p_checking' }], matchedTargetIds: [ASSETS_TUNNEL.id, CRM_TUNNEL.id], p2pState: 'checking', p2pReason: 'candidate_check' }),
  'p2p.connected': fixture({ event: 'p2p.connected', severity: 'info', summary: 'P2P 会话已建立直连', reasonCode: 'direct_connected', expected: true, data: { state: 'connected', transport: 'direct' }, clients: [HK_CLIENT, SZ_CLIENT], tunnels: [ASSETS_TUNNEL, CRM_TUNNEL], matchedTargetIds: [ASSETS_TUNNEL.id, CRM_TUNNEL.id], p2pState: 'connected', p2pReason: 'direct_connected' }),
  'p2p.failed': fixture({ event: 'p2p.failed', severity: 'warning', summary: 'P2P 直连建立失败', reasonCode: 'negotiation_failed', expected: false, data: { state: 'failed' }, clients: [HK_CLIENT, SZ_CLIENT], tunnels: [ASSETS_TUNNEL, CRM_TUNNEL], matchedTargetIds: [ASSETS_TUNNEL.id, CRM_TUNNEL.id], p2pState: 'failed', p2pReason: 'negotiation_failed' }),
  'p2p.fallback': fixture({ event: 'p2p.fallback', severity: 'warning', summary: 'P2P 会话已回退到 Server 中继', reasonCode: 'participant_offline', expected: false, data: { state: 'fallback', transport: 'relay' }, clients: [HK_CLIENT, { ...SZ_CLIENT, status: 'offline' }], tunnels: [ASSETS_TUNNEL, CRM_TUNNEL], matchedTargetIds: [ASSETS_TUNNEL.id, CRM_TUNNEL.id], p2pState: 'fallback', p2pReason: 'participant_offline' }),
  'p2p.session_closed': fixture({ event: 'p2p.session_closed', severity: 'info', summary: 'P2P 会话已关闭', reasonCode: 'session_closed', expected: true, data: { state: 'closed' }, clients: [HK_CLIENT, SZ_CLIENT], tunnels: [ASSETS_TUNNEL, CRM_TUNNEL], matchedTargetIds: [ASSETS_TUNNEL.id, CRM_TUNNEL.id], p2pState: 'closed', p2pReason: 'session_closed' }),
};

export interface WebhookVariable {
  key: string;
  group: 'delivery' | 'event' | 'client' | 'tunnel' | 'subjects' | 'match' | 'p2p' | 'webhook';
  valueType: 'text' | 'number' | 'boolean' | 'json';
  surfaces: WebhookTemplateSurface[];
  availableForEvents: 'all' | WebhookEventKey[];
}

const EVERY_SURFACE: WebhookTemplateSurface[] = ['url', 'header', 'body'];
const BODY_ONLY: WebhookTemplateSurface[] = ['body'];

export const WEBHOOK_VARIABLES: WebhookVariable[] = [
  { key: 'delivery.id', group: 'delivery', valueType: 'text', surfaces: EVERY_SURFACE, availableForEvents: 'all' },
  { key: 'delivery.attempt', group: 'delivery', valueType: 'number', surfaces: BODY_ONLY, availableForEvents: 'all' },
  { key: 'event.id', group: 'event', valueType: 'text', surfaces: EVERY_SURFACE, availableForEvents: 'all' },
  { key: 'event.type', group: 'event', valueType: 'text', surfaces: EVERY_SURFACE, availableForEvents: 'all' },
  { key: 'event.category', group: 'event', valueType: 'text', surfaces: EVERY_SURFACE, availableForEvents: 'all' },
  { key: 'event.severity', group: 'event', valueType: 'text', surfaces: EVERY_SURFACE, availableForEvents: 'all' },
  { key: 'event.occurred_at', group: 'event', valueType: 'text', surfaces: EVERY_SURFACE, availableForEvents: 'all' },
  { key: 'event.summary', group: 'event', valueType: 'text', surfaces: EVERY_SURFACE, availableForEvents: 'all' },
  { key: 'event.reason_code', group: 'event', valueType: 'text', surfaces: EVERY_SURFACE, availableForEvents: 'all' },
  { key: 'event.expected', group: 'event', valueType: 'boolean', surfaces: BODY_ONLY, availableForEvents: 'all' },
  { key: 'event.data', group: 'event', valueType: 'json', surfaces: BODY_ONLY, availableForEvents: 'all' },
  { key: 'subjects.clients', group: 'subjects', valueType: 'json', surfaces: BODY_ONLY, availableForEvents: 'all' },
  { key: 'subjects.tunnels', group: 'subjects', valueType: 'json', surfaces: BODY_ONLY, availableForEvents: 'all' },
  { key: 'subjects.client_ids_csv', group: 'subjects', valueType: 'text', surfaces: EVERY_SURFACE, availableForEvents: 'all' },
  { key: 'subjects.tunnel_ids_csv', group: 'subjects', valueType: 'text', surfaces: EVERY_SURFACE, availableForEvents: 'all' },
  { key: 'match.target_ids', group: 'match', valueType: 'json', surfaces: BODY_ONLY, availableForEvents: 'all' },
  { key: 'match.target_ids_csv', group: 'match', valueType: 'text', surfaces: EVERY_SURFACE, availableForEvents: 'all' },
  { key: 'client.id', group: 'client', valueType: 'text', surfaces: EVERY_SURFACE, availableForEvents: CLIENT_EVENTS },
  { key: 'client.name', group: 'client', valueType: 'text', surfaces: EVERY_SURFACE, availableForEvents: CLIENT_EVENTS },
  { key: 'client.status', group: 'client', valueType: 'text', surfaces: EVERY_SURFACE, availableForEvents: CLIENT_EVENTS },
  { key: 'tunnel.id', group: 'tunnel', valueType: 'text', surfaces: EVERY_SURFACE, availableForEvents: TUNNEL_EVENTS },
  { key: 'tunnel.name', group: 'tunnel', valueType: 'text', surfaces: EVERY_SURFACE, availableForEvents: TUNNEL_EVENTS },
  { key: 'tunnel.runtime_state', group: 'tunnel', valueType: 'text', surfaces: EVERY_SURFACE, availableForEvents: TUNNEL_EVENTS },
  { key: 'p2p.state', group: 'p2p', valueType: 'text', surfaces: EVERY_SURFACE, availableForEvents: P2P_EVENTS },
  { key: 'p2p.reason', group: 'p2p', valueType: 'text', surfaces: EVERY_SURFACE, availableForEvents: P2P_EVENTS },
  { key: 'webhook.id', group: 'webhook', valueType: 'text', surfaces: EVERY_SURFACE, availableForEvents: 'all' },
  { key: 'webhook.name', group: 'webhook', valueType: 'text', surfaces: EVERY_SURFACE, availableForEvents: 'all' },
];

export function webhookVariableSupportsEvents(variable: WebhookVariable, events: WebhookEventKey[]) {
  if (variable.availableForEvents === 'all') return true;
  return events.length > 0 && events.every((event) => variable.availableForEvents.includes(event));
}

export function getWebhookVariables(events: WebhookEventKey[], surface: WebhookTemplateSurface) {
  return WEBHOOK_VARIABLES.filter((variable) => variable.surfaces.includes(surface) && webhookVariableSupportsEvents(variable, events));
}

export function webhookVariableSample(
  variable: WebhookVariable,
  event: WebhookEventKey,
  webhook?: Pick<WebhookPrototype, 'id' | 'name'>,
) {
  if (variable.key === 'webhook.id' && webhook) return webhook.id;
  if (variable.key === 'webhook.name' && webhook) return webhook.name || 'Webhook';
  const value = WEBHOOK_EVENT_FIXTURES[event].values[variable.key];
  return typeof value === 'string' ? value : JSON.stringify(value ?? null);
}

export type WebhookInvocationStatus = 'queued' | 'retrying' | 'success' | 'failed' | 'canceled';
export type WebhookInvocationOrigin = 'event' | 'test' | 'replay';

export interface WebhookInvocationAttempt {
  number: number;
  occurredAt: string;
  status: 'success' | 'failed' | 'pending';
  statusCode: number | null;
  durationMs: number | null;
  error?: string;
}

export interface WebhookInvocation {
  id: string;
  webhookId: string;
  eventId: string;
  event: WebhookEventKey;
  occurredAt: string;
  status: WebhookInvocationStatus;
  origin: WebhookInvocationOrigin;
  statusCode: number | null;
  durationMs: number | null;
  attempts: WebhookInvocationAttempt[];
  requestUrl: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseHeaders: Record<string, string>;
  responseBody: string;
  error?: string;
}

export const WEBHOOK_INVOCATIONS: WebhookInvocation[] = [
  {
    id: 'dlv_01K34X6F2P', webhookId: 'wh_client_presence', eventId: 'evt_01K34X6F2P', event: 'client.offline', occurredAt: '2026-08-21T10:42:16+08:00', status: 'success', origin: 'event', statusCode: 200, durationMs: 184,
    attempts: [{ number: 1, occurredAt: '2026-08-21T10:42:16+08:00', status: 'success', statusCode: 200, durationMs: 184 }],
    requestUrl: 'https://hooks.example.com/netsgo/activity', requestHeaders: { 'Content-Type': 'application/json', Authorization: 'Bearer demo-client-token', 'X-NetsGo-Delivery': 'dlv_01K34X6F2P' },
    requestBody: '{"schema_version":1,"delivery":{"id":"dlv_01K34X6F2P","attempt":1},"event":{"id":"evt_01K34X6F2P","type":"client.offline","severity":"warning"},"subjects":{"clients":[{"id":"client_hk_edge_01","name":"香港节点 01","status":"offline"}],"tunnels":[]},"matched_target_ids":["client_hk_edge_01"]}',
    responseHeaders: { 'Content-Type': 'application/json' }, responseBody: '{"accepted":true}',
  },
  {
    id: 'dlv_01K34VPE02', webhookId: 'wh_tunnel_alerts', eventId: 'evt_01K34VPE02', event: 'tunnel.runtime_recovered', occurredAt: '2026-08-21T09:58:44+08:00', status: 'success', origin: 'event', statusCode: 204, durationMs: 92,
    attempts: [{ number: 1, occurredAt: '2026-08-21T09:58:44+08:00', status: 'success', statusCode: 204, durationMs: 92 }],
    requestUrl: 'https://status.example.net/notify?event=tunnel.runtime_recovered&tunnel=tunnel_wms_tcp&state=exposed', requestHeaders: { 'X-Webhook-Token': 'demo-tunnel-token', 'X-NetsGo-Delivery': 'dlv_01K34VPE02' }, requestBody: null, responseHeaders: {}, responseBody: '',
  },
  {
    id: 'dlv_01K34T6E5A', webhookId: 'wh_client_presence', eventId: 'evt_01K34T6E5A', event: 'client.online', occurredAt: '2026-08-21T08:16:31+08:00', status: 'failed', origin: 'event', statusCode: 503, durationMs: 1204,
    attempts: [
      { number: 1, occurredAt: '2026-08-21T08:16:31+08:00', status: 'failed', statusCode: 503, durationMs: 338, error: 'HTTP 503' },
      { number: 2, occurredAt: '2026-08-21T08:16:36+08:00', status: 'failed', statusCode: 503, durationMs: 401, error: 'HTTP 503' },
      { number: 3, occurredAt: '2026-08-21T08:16:47+08:00', status: 'failed', statusCode: 503, durationMs: 465, error: 'HTTP 503' },
    ],
    requestUrl: 'https://hooks.example.com/netsgo/activity', requestHeaders: { 'Content-Type': 'application/json', Authorization: 'Bearer demo-client-token', 'X-NetsGo-Delivery': 'dlv_01K34T6E5A' },
    requestBody: '{"schema_version":1,"delivery":{"id":"dlv_01K34T6E5A","attempt":3},"event":{"id":"evt_01K34T6E5A","type":"client.online","severity":"info"},"subjects":{"clients":[{"id":"client_hk_edge_01","name":"香港节点 01","status":"online"}],"tunnels":[]},"matched_target_ids":["client_hk_edge_01"]}',
    responseHeaders: { 'Content-Type': 'application/json', 'Retry-After': '30' }, responseBody: '{"error":"service temporarily unavailable"}', error: '目标接口连续 3 次返回 503，本次调用已停止重试。',
  },
];
