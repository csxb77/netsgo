import { describe, expect, test } from 'vitest';

import type { ActivityWebhookConfig, WebhookCatalog, WebhookVariable } from '@/types/webhook';
import {
  getTemplateIssues,
  getWebhookVariables,
  renderJsonBody,
  renderTemplate,
  renderWebhookRequest,
  validateWebhook,
  webhookVariableSample,
} from './webhook-template';

const defaultBody = `{
  "delivery": { "attempt": "{{delivery.attempt}}" },
  "event": { "expected": "{{event.expected}}" },
  "subjects": {
    "clients": "{{subjects.clients}}",
    "tunnels": "{{subjects.tunnels}}"
  },
  "matched_target_ids": "{{match.target_ids}}"
}`;

const allEvents = 'all' as const;
const body = ['body'] as const;
const everySurface = ['url', 'header', 'body'] as const;
const variables: WebhookVariable[] = [
  { key: 'delivery.id', group: 'delivery', value_type: 'text', surfaces: [...everySurface], available_for_events: allEvents },
  { key: 'delivery.attempt', group: 'delivery', value_type: 'number', surfaces: [...body], available_for_events: allEvents },
  { key: 'event.type', group: 'event', value_type: 'text', surfaces: [...everySurface], available_for_events: allEvents },
  { key: 'event.expected', group: 'event', value_type: 'boolean', surfaces: [...body], available_for_events: allEvents },
  { key: 'event.data', group: 'event', value_type: 'json', surfaces: [...body], available_for_events: allEvents },
  { key: 'subjects.clients', group: 'subjects', value_type: 'json', surfaces: [...body], available_for_events: allEvents },
  { key: 'subjects.tunnels', group: 'subjects', value_type: 'json', surfaces: [...body], available_for_events: allEvents },
  { key: 'match.target_ids', group: 'match', value_type: 'json', surfaces: [...body], available_for_events: allEvents },
  { key: 'client.status', group: 'client', value_type: 'text', surfaces: [...everySurface], available_for_events: ['client.online'] },
  { key: 'tunnel.id', group: 'tunnel', value_type: 'text', surfaces: [...everySurface], available_for_events: ['tunnel.runtime_error'] },
  { key: 'p2p.state', group: 'p2p', value_type: 'text', surfaces: [...everySurface], available_for_events: ['p2p.connected', 'p2p.failed'] },
  { key: 'webhook.id', group: 'webhook', value_type: 'text', surfaces: [...everySurface], available_for_events: allEvents },
  { key: 'webhook.name', group: 'webhook', value_type: 'text', surfaces: [...everySurface], available_for_events: allEvents },
];

const catalog: WebhookCatalog = {
  events: [
    { key: 'client.online', target_kind: 'client', family: 'client' },
    { key: 'tunnel.runtime_error', target_kind: 'tunnel', family: 'tunnel' },
    { key: 'p2p.connected', target_kind: 'tunnel', family: 'p2p' },
    { key: 'p2p.failed', target_kind: 'tunnel', family: 'p2p' },
  ],
  variables,
  fixtures: {
    'client.online': {
      'delivery.id': 'dlv-client-online',
      'delivery.attempt': 1,
      'event.type': 'client.online',
      'event.expected': true,
      'event.data': { status: 'online', count: 2 },
      'client.status': 'online',
      'subjects.clients': [{ id: 'client-a' }],
      'subjects.tunnels': [],
      'match.target_ids': ['client-a'],
    },
    'p2p.connected': {
      'delivery.id': 'dlv-p2p-connected',
      'delivery.attempt': 1,
      'event.type': 'p2p.connected',
      'event.expected': true,
      'event.data': { state: 'connected' },
      'subjects.clients': [{ id: 'client-a' }, { id: 'client-b' }],
      'subjects.tunnels': [{ id: 'tunnel-a' }, { id: 'tunnel-b' }],
      'match.target_ids': ['tunnel-a', 'tunnel-b'],
      'p2p.state': 'connected',
    },
    'p2p.failed': {
      'delivery.id': 'dlv-p2p-failed',
      'delivery.attempt': 1,
      'event.type': 'p2p.failed',
      'event.expected': false,
      'event.data': { state: 'failed' },
      'subjects.clients': [],
      'subjects.tunnels': [],
      'match.target_ids': [],
      'p2p.state': 'failed',
    },
    'tunnel.runtime_error': {
      'delivery.id': 'dlv-tunnel-error',
      'delivery.attempt': 1,
      'event.type': 'tunnel.runtime_error',
      'event.expected': false,
      'event.data': { state: 'error' },
      'subjects.clients': [],
      'subjects.tunnels': [{ id: 'tunnel-a' }],
      'match.target_ids': ['tunnel-a'],
      'tunnel.id': 'tunnel-a',
    },
  } as WebhookCatalog['fixtures'],
  default_body: defaultBody,
};

function webhook(overrides: Partial<ActivityWebhookConfig>): ActivityWebhookConfig {
  return {
    id: 'wh_test',
    revision: 0,
    name: 'Test webhook',
    enabled: false,
    targetKind: 'client',
    targetMode: 'all',
    targetIds: [],
    method: 'POST',
    url: 'https://hooks.example.test/events',
    headers: [],
    body: defaultBody,
    events: ['client.online'],
    calls24h: 0,
    lastStatus: 'idle',
    consecutiveFailures: 0,
    lastCalledAt: null,
    createdAt: '2026-08-25T00:00:00Z',
    updatedAt: '2026-08-25T00:00:00Z',
    ...overrides,
  };
}

describe('webhook request templates', () => {
  test('renders one P2P event with typed client, tunnel, and match arrays', () => {
    const request = renderWebhookRequest(webhook({
      targetKind: 'tunnel',
      events: ['p2p.connected'],
    }), 'p2p.connected', catalog);

    const rendered = JSON.parse(request.body);
    expect(rendered.delivery.attempt).toBe(1);
    expect(rendered.event.expected).toBe(true);
    expect(rendered.subjects.clients).toHaveLength(2);
    expect(rendered.subjects.tunnels).toHaveLength(2);
    expect(rendered.matched_target_ids).toEqual(['tunnel-a', 'tunnel-b']);
  });

  test('rejects a singular tunnel variable when P2P events share the template', () => {
    const issues = validateWebhook(webhook({
      targetKind: 'tunnel',
      events: ['tunnel.runtime_error', 'p2p.failed'],
      body: '{"tunnel_id":"{{tunnel.id}}"}',
    }), catalog);

    expect(issues).toContainEqual({
      field: 'body',
      code: 'unavailableVariable',
      key: 'tunnel.id',
    });
  });

  test('uses catalog fixtures as the single source of preview examples', () => {
    expect(catalog.fixtures['client.online']['client.status']).toBe('online');
    expect(catalog.fixtures['p2p.connected']['p2p.state']).toBe('connected');
    expect(catalog.fixtures['p2p.failed']['p2p.state']).toBe('failed');
  });

  test('renders Header values in plaintext', () => {
    const request = renderWebhookRequest(webhook({
      headers: [{ id: 'authorization', key: 'Authorization', value: 'Bearer demo-client-token' }],
    }), 'client.online', catalog);

    expect(request.headers).toEqual([{ key: 'Authorization', value: 'Bearer demo-client-token' }]);
  });

  test('URL-encodes substitutions while retaining unknown tokens for diagnosis', () => {
    const request = renderWebhookRequest(webhook({
      name: '深圳 / primary',
      url: 'https://hooks.example.test/{{webhook.name}}?status={{client.status}}&missing={{missing.value}}',
    }), 'client.online', catalog);

    expect(request.url).toBe('https://hooks.example.test/%E6%B7%B1%E5%9C%B3%20%2F%20primary?status=online&missing={{missing.value}}');
  });

  test('preserves exact-token JSON types through nested objects and arrays', () => {
    const rendered = renderJsonBody(`{
      "attempt": "{{delivery.attempt}}",
      "expected": "{{event.expected}}",
      "data": "{{event.data}}",
      "items": ["{{subjects.clients}}", "attempt={{delivery.attempt}}"],
      "missing": "{{missing.value}}"
    }`, catalog.fixtures['client.online']);

    expect(JSON.parse(rendered)).toEqual({
      attempt: 1,
      expected: true,
      data: { status: 'online', count: 2 },
      items: [[{ id: 'client-a' }], 'attempt=1'],
      missing: '{{missing.value}}',
    });
  });

  test('reports preview body errors without replacing the editable source', () => {
    const request = renderWebhookRequest(webhook({ body: '{invalid' }), 'client.online', catalog);
    expect(request.bodyError).toBe(true);
    expect(request.body).toBe('{invalid');
  });

  test('GET previews never render a body', () => {
    const request = renderWebhookRequest(webhook({ method: 'GET', body: '{invalid' }), 'client.online', catalog);
    expect(request.bodyError).toBe(false);
    expect(request.body).toBe('');
  });

  test('filters picker variables by surface and every selected event', () => {
    expect(getWebhookVariables(catalog, ['client.online'], 'url').map((item) => item.key)).toEqual([
      'delivery.id',
      'event.type',
      'client.status',
      'webhook.id',
      'webhook.name',
    ]);
    expect(getWebhookVariables(catalog, ['tunnel.runtime_error', 'p2p.failed'], 'url').map((item) => item.key)).toEqual([
      'delivery.id',
      'event.type',
      'webhook.id',
      'webhook.name',
    ]);
  });

  test('formats fixture and current-webhook samples for the variable picker', () => {
    expect(webhookVariableSample(catalog, variables.find((item) => item.key === 'event.data')!, 'client.online')).toBe('{"status":"online","count":2}');
    expect(webhookVariableSample(catalog, variables.find((item) => item.key === 'webhook.name')!, 'client.online', webhook({ name: 'Current name' }))).toBe('Current name');
    expect(webhookVariableSample(catalog, variables.find((item) => item.key === 'webhook.name')!, 'client.online', webhook({ name: '' }))).toBe('Webhook');
  });

  test('renders plain text values and URL encoding directly', () => {
    const values = { text: 'a b/深圳', object: { ok: true }, nil: null };
    expect(renderTemplate('{{text}} {{object}} {{nil}} {{missing}}', values)).toBe('a b/深圳 {"ok":true}  {{missing}}');
    expect(renderTemplate('{{text}}', values, true)).toBe('a%20b%2F%E6%B7%B1%E5%9C%B3');
  });
});

describe('webhook configuration validation', () => {
  test('reports every missing required field in one pass', () => {
    expect(validateWebhook(webhook({
      name: ' ',
      events: [],
      targetMode: 'selected',
      targetIds: [],
      url: ' ',
    }), catalog)).toEqual(expect.arrayContaining([
      { field: 'name', code: 'required' },
      { field: 'events', code: 'required' },
      { field: 'targets', code: 'required' },
      { field: 'url', code: 'required' },
    ]));
  });

  test.each([
    ['not a URL', 'invalidUrl'],
    ['ftp://hooks.example.test/path', 'invalidUrlScheme'],
  ])('rejects destination %s with %s', (url, code) => {
    expect(validateWebhook(webhook({ url }), catalog)).toContainEqual({ field: 'url', code });
  });

  test('reports unknown, unsupported-surface, and unavailable URL variables', () => {
    expect(getTemplateIssues('{{missing.value}}', ['client.online'], 'url', variables)).toEqual([
      expect.objectContaining({ code: 'unknownVariable', key: 'missing.value' }),
    ]);
    expect(validateWebhook(webhook({ url: 'https://example.test/{{delivery.attempt}}' }), catalog)).toContainEqual({
      field: 'url', code: 'unsupportedSurface', key: 'delivery.attempt',
    });
    expect(validateWebhook(webhook({ url: 'https://example.test/{{tunnel.id}}' }), catalog)).toContainEqual({
      field: 'url', code: 'unavailableVariable', key: 'tunnel.id',
    });
  });

  test('rejects malformed, duplicated, restricted, and injected Headers', () => {
    const issues = validateWebhook(webhook({
      headers: [
        { id: 'invalid', key: 'Bad Header', value: 'value' },
        { id: 'first', key: 'X-Test', value: 'one' },
        { id: 'duplicate', key: 'x-test', value: 'two' },
        { id: 'restricted', key: 'X-NetsGo-Attempt', value: '99' },
        { id: 'newline', key: 'X-Newline', value: 'one\ntwo' },
      ],
    }), catalog);

    expect(issues).toEqual(expect.arrayContaining([
      { field: 'headers', code: 'invalidHeader', key: 'Bad Header' },
      { field: 'headers', code: 'duplicateHeader', key: 'x-test' },
      { field: 'headers', code: 'restrictedHeader', key: 'X-NetsGo-Attempt' },
      { field: 'headers', code: 'invalidHeader', key: 'X-Newline' },
    ]));
  });

  test.each([
    ['{invalid', 'invalidJson'],
    ['null', 'bodyMustBeObject'],
    ['[]', 'bodyMustBeObject'],
    ['"text"', 'bodyMustBeObject'],
  ])('rejects POST body %s with %s', (bodyValue, code) => {
    expect(validateWebhook(webhook({ body: bodyValue }), catalog)).toContainEqual({ field: 'body', code });
  });

  test('validates body variables across all selected events', () => {
    expect(validateWebhook(webhook({
      targetKind: 'tunnel',
      events: ['tunnel.runtime_error', 'p2p.connected'],
      body: '{"tunnel":"{{tunnel.id}}"}',
    }), catalog)).toContainEqual({ field: 'body', code: 'unavailableVariable', key: 'tunnel.id' });
  });

  test('does not apply POST body validation to GET requests', () => {
    const issues = validateWebhook(webhook({ method: 'GET', body: '{invalid {{missing.value}}' }), catalog);
    expect(issues.filter((issue) => issue.field === 'body')).toEqual([]);
  });

  test('accepts a complete client Webhook configuration', () => {
    expect(validateWebhook(webhook({
      targetMode: 'selected',
      targetIds: ['client-a'],
      url: 'https://hooks.example.test/{{event.type}}?delivery={{delivery.id}}',
      headers: [{ id: 'event', key: 'X-Event', value: '{{event.type}}' }],
    }), catalog)).toEqual([]);
  });
});
