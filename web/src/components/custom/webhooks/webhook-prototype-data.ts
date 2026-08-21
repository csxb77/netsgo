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
export type WebhookEventGroup = WebhookTargetKind;

export const WEBHOOK_EVENT_OPTIONS: Array<{
  key: WebhookEventKey;
  group: WebhookEventGroup;
}> = [
  { key: 'client.online', group: 'client' },
  { key: 'client.offline', group: 'client' },
  { key: 'tunnel.stopped', group: 'tunnel' },
  { key: 'tunnel.resumed', group: 'tunnel' },
  { key: 'tunnel.runtime_changed', group: 'tunnel' },
  { key: 'tunnel.runtime_error', group: 'tunnel' },
  { key: 'tunnel.runtime_recovered', group: 'tunnel' },
  { key: 'p2p.checking', group: 'tunnel' },
  { key: 'p2p.connected', group: 'tunnel' },
  { key: 'p2p.failed', group: 'tunnel' },
  { key: 'p2p.fallback', group: 'tunnel' },
  { key: 'p2p.session_closed', group: 'tunnel' },
];

export interface WebhookTargetOption {
  id: string;
  name: string;
  detail: string;
}

export const WEBHOOK_CLIENT_OPTIONS: WebhookTargetOption[] = [
  { id: 'client_hk_edge_01', name: '香港节点 01', detail: 'hk-edge-01 · online' },
  { id: 'client_sz_render_03', name: '深圳渲染节点 03', detail: 'sz-render-03 · online' },
  { id: 'client_tokyo_backup', name: '东京备份节点', detail: 'tokyo-backup · offline' },
];

export const WEBHOOK_TUNNEL_OPTIONS: WebhookTargetOption[] = [
  { id: 'tunnel_crm_https', name: 'CRM HTTPS', detail: 'HTTPS · 香港节点 01' },
  { id: 'tunnel_wms_tcp', name: 'WMS TCP', detail: 'TCP · 深圳渲染节点 03' },
  { id: 'tunnel_assets_p2p', name: 'Assets P2P', detail: 'P2P · 香港节点 01 ↔ 深圳渲染节点 03' },
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
  lastStatus: 'success' | 'failed' | 'idle';
  lastCalledAt: string | null;
}

export const DEFAULT_CLIENT_WEBHOOK_BODY = `{
  "event_id": "{{event.id}}",
  "event_type": "{{event.type}}",
  "occurred_at": "{{event.occurred_at}}",
  "severity": "{{event.severity}}",
  "client": {
    "id": "{{client.id}}",
    "name": "{{client.name}}",
    "status": "{{client.status}}"
  }
}`;

export const DEFAULT_TUNNEL_WEBHOOK_BODY = `{
  "event_id": "{{event.id}}",
  "event_type": "{{event.type}}",
  "occurred_at": "{{event.occurred_at}}",
  "tunnel": {
    "id": "{{tunnel.id}}",
    "name": "{{tunnel.name}}",
    "runtime_state": "{{tunnel.runtime_state}}"
  }
}`;

export const DEFAULT_P2P_WEBHOOK_BODY = `{
  "event_id": "{{event.id}}",
  "event_type": "{{event.type}}",
  "occurred_at": "{{event.occurred_at}}",
  "tunnel_id": "{{tunnel.id}}",
  "p2p": {
    "state": "{{p2p.state}}",
    "reason": "{{p2p.reason}}"
  }
}`;

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
      { id: 'header-client-auth', key: 'Authorization', value: 'Bearer ••••••••' },
    ],
    body: `{
  "event_id": "{{event.id}}",
  "event_type": "{{event.type}}",
  "occurred_at": "{{event.occurred_at}}",
  "client": {
    "id": "{{client.id}}",
    "name": "{{client.name}}",
    "status": "{{client.status}}"
  }
}`,
    events: ['client.online', 'client.offline'],
    calls24h: 184,
    lastStatus: 'success',
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
    headers: [
      { id: 'header-tunnel-token', key: 'X-Webhook-Token', value: '••••••••' },
    ],
    body: '',
    events: ['tunnel.runtime_changed', 'tunnel.runtime_error', 'tunnel.runtime_recovered'],
    calls24h: 31,
    lastStatus: 'success',
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
    headers: [
      { id: 'header-p2p-content', key: 'Content-Type', value: 'application/json' },
    ],
    body: DEFAULT_P2P_WEBHOOK_BODY,
    events: ['p2p.connected', 'p2p.failed', 'p2p.fallback', 'p2p.session_closed'],
    calls24h: 0,
    lastStatus: 'idle',
    lastCalledAt: null,
  },
];

export const EMPTY_WEBHOOK: WebhookPrototype = {
  id: 'wh_new',
  name: '',
  enabled: true,
  targetKind: 'client',
  targetMode: 'all',
  targetIds: [],
  method: 'POST',
  url: 'https://example.com/webhooks/netsgo',
  headers: [
    { id: 'header-content-type', key: 'Content-Type', value: 'application/json' },
  ],
  body: DEFAULT_CLIENT_WEBHOOK_BODY,
  events: ['client.online', 'client.offline'],
  calls24h: 0,
  lastStatus: 'idle',
  lastCalledAt: null,
};

export interface WebhookVariable {
  key: string;
  group: 'event' | 'client' | 'tunnel' | 'p2p' | 'webhook';
  sample: string;
  availableFor: WebhookTargetKind[];
}

const everyEvent: WebhookTargetKind[] = ['client', 'tunnel'];

export function webhookVariableSample(variable: WebhookVariable, targetKind: WebhookTargetKind) {
  if (targetKind === 'tunnel') {
    if (variable.key === 'event.type') return 'tunnel.runtime_changed';
    if (variable.key === 'event.category') return 'tunnel';
    if (variable.key === 'event.summary') return 'CRM HTTPS 运行状态已改变';
  }
  return variable.sample;
}

export const WEBHOOK_VARIABLES: WebhookVariable[] = [
  { key: 'event.id', group: 'event', sample: 'evt_01K34X6F2P', availableFor: everyEvent },
  { key: 'event.type', group: 'event', sample: 'client.offline', availableFor: everyEvent },
  { key: 'event.category', group: 'event', sample: 'client', availableFor: everyEvent },
  { key: 'event.severity', group: 'event', sample: 'info', availableFor: everyEvent },
  { key: 'event.occurred_at', group: 'event', sample: '2026-08-21T10:42:16+08:00', availableFor: everyEvent },
  { key: 'event.summary', group: 'event', sample: '香港节点 01 已离线', availableFor: everyEvent },
  { key: 'client.id', group: 'client', sample: 'client_hk_edge_01', availableFor: ['client'] },
  { key: 'client.name', group: 'client', sample: '香港节点 01', availableFor: ['client'] },
  { key: 'client.status', group: 'client', sample: 'offline', availableFor: ['client'] },
  { key: 'tunnel.id', group: 'tunnel', sample: 'tunnel_crm_https', availableFor: ['tunnel'] },
  { key: 'tunnel.name', group: 'tunnel', sample: 'CRM HTTPS', availableFor: ['tunnel'] },
  { key: 'tunnel.runtime_state', group: 'tunnel', sample: 'offline', availableFor: ['tunnel'] },
  { key: 'p2p.state', group: 'p2p', sample: 'fallback', availableFor: ['tunnel'] },
  { key: 'p2p.reason', group: 'p2p', sample: 'participant_offline', availableFor: ['tunnel'] },
  { key: 'webhook.id', group: 'webhook', sample: 'wh_client_presence', availableFor: everyEvent },
  { key: 'webhook.name', group: 'webhook', sample: '客户端上下线通知', availableFor: everyEvent },
];

export interface WebhookInvocation {
  id: string;
  webhookId: string;
  event: WebhookEventKey;
  occurredAt: string;
  status: 'success' | 'failed';
  statusCode: number | null;
  durationMs: number;
  attempt: number;
  requestUrl: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseHeaders: Record<string, string>;
  responseBody: string;
  error?: string;
}

export const WEBHOOK_INVOCATIONS: WebhookInvocation[] = [
  {
    id: 'call_01K34X6F2P',
    webhookId: 'wh_client_presence',
    event: 'client.offline',
    occurredAt: '2026-08-21T10:42:16+08:00',
    status: 'success',
    statusCode: 200,
    durationMs: 184,
    attempt: 1,
    requestUrl: 'https://hooks.example.com/netsgo/activity',
    requestHeaders: { 'Content-Type': 'application/json', Authorization: 'Bearer ••••••••', 'X-NetsGo-Delivery': 'call_01K34X6F2P' },
    requestBody: '{"event_id":"evt_01K34X6F2P","event_type":"client.offline","occurred_at":"2026-08-21T10:42:16+08:00","client":{"id":"client_hk_edge_01","name":"香港节点 01","status":"offline"}}',
    responseHeaders: { 'Content-Type': 'application/json' },
    responseBody: '{"accepted":true}',
  },
  {
    id: 'call_01K34VPE02',
    webhookId: 'wh_tunnel_alerts',
    event: 'tunnel.runtime_recovered',
    occurredAt: '2026-08-21T09:58:44+08:00',
    status: 'success',
    statusCode: 204,
    durationMs: 92,
    attempt: 1,
    requestUrl: 'https://status.example.net/notify?event=tunnel.runtime_recovered&tunnel=tunnel_wms_tcp&state=exposed',
    requestHeaders: { 'X-Webhook-Token': '••••••••', 'X-NetsGo-Delivery': 'call_01K34VPE02' },
    requestBody: null,
    responseHeaders: {},
    responseBody: '',
  },
  {
    id: 'call_01K34T6E5A',
    webhookId: 'wh_client_presence',
    event: 'client.online',
    occurredAt: '2026-08-21T08:16:31+08:00',
    status: 'failed',
    statusCode: 503,
    durationMs: 1204,
    attempt: 3,
    requestUrl: 'https://hooks.example.com/netsgo/activity',
    requestHeaders: { 'Content-Type': 'application/json', Authorization: 'Bearer ••••••••', 'X-NetsGo-Delivery': 'call_01K34T6E5A' },
    requestBody: '{"event_id":"evt_01K34T6E5A","event_type":"client.online","occurred_at":"2026-08-21T08:16:31+08:00","client":{"id":"client_hk_edge_01","name":"香港节点 01","status":"online"}}',
    responseHeaders: { 'Content-Type': 'application/json', 'Retry-After': '30' },
    responseBody: '{"error":"service temporarily unavailable"}',
    error: '目标接口连续 3 次返回 503，本次调用已停止重试。',
  },
];
