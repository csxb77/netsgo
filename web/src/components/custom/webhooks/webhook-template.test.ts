import { describe, expect, test } from 'vitest';

import type { ActivityWebhookConfig, WebhookCatalog, WebhookVariable } from '@/types/webhook';
import { renderWebhookRequest, validateWebhook } from './webhook-template';

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
  { key: 'delivery.attempt', group: 'delivery', value_type: 'number', surfaces: [...body], available_for_events: allEvents },
  { key: 'event.expected', group: 'event', value_type: 'boolean', surfaces: [...body], available_for_events: allEvents },
  { key: 'subjects.clients', group: 'subjects', value_type: 'json', surfaces: [...body], available_for_events: allEvents },
  { key: 'subjects.tunnels', group: 'subjects', value_type: 'json', surfaces: [...body], available_for_events: allEvents },
  { key: 'match.target_ids', group: 'match', value_type: 'json', surfaces: [...body], available_for_events: allEvents },
  { key: 'tunnel.id', group: 'tunnel', value_type: 'text', surfaces: [...everySurface], available_for_events: ['tunnel.runtime_error'] },
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
    'client.online': { 'client.status': 'online' },
    'p2p.connected': {
      'delivery.attempt': 1,
      'event.expected': true,
      'subjects.clients': [{ id: 'client-a' }, { id: 'client-b' }],
      'subjects.tunnels': [{ id: 'tunnel-a' }, { id: 'tunnel-b' }],
      'match.target_ids': ['tunnel-a', 'tunnel-b'],
      'p2p.state': 'connected',
    },
    'p2p.failed': { 'p2p.state': 'failed' },
    'tunnel.runtime_error': { 'tunnel.id': 'tunnel-a' },
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
});
