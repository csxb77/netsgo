import { describe, expect, test } from 'vitest';

import {
  DEFAULT_P2P_WEBHOOK_BODY,
  EMPTY_WEBHOOK,
  WEBHOOK_EVENT_FIXTURES,
  type WebhookPrototype,
} from './webhook-prototype-data';
import { renderWebhookRequest, validateWebhook } from './webhook-template';

function webhook(overrides: Partial<WebhookPrototype>): WebhookPrototype {
  return { ...structuredClone(EMPTY_WEBHOOK), name: 'Test webhook', ...overrides };
}

describe('webhook request templates', () => {
  test('renders one P2P event with typed client, tunnel, and match arrays', () => {
    const request = renderWebhookRequest(webhook({
      targetKind: 'tunnel',
      events: ['p2p.connected'],
      body: DEFAULT_P2P_WEBHOOK_BODY,
    }), 'p2p.connected');

    const body = JSON.parse(request.body);
    expect(body.delivery.attempt).toBe(1);
    expect(body.event.expected).toBe(true);
    expect(body.subjects.clients).toHaveLength(2);
    expect(body.subjects.tunnels).toHaveLength(2);
    expect(body.matched_target_ids).toEqual(['tunnel_assets_p2p', 'tunnel_crm_https']);
  });

  test('rejects a singular tunnel variable when P2P events share the template', () => {
    const issues = validateWebhook(webhook({
      targetKind: 'tunnel',
      events: ['tunnel.runtime_error', 'p2p.failed'],
      body: '{"tunnel_id":"{{tunnel.id}}"}',
    }));

    expect(issues).toContainEqual({
      field: 'body',
      code: 'unavailableVariable',
      key: 'tunnel.id',
    });
  });

  test('keeps event fixtures internally consistent', () => {
    expect(WEBHOOK_EVENT_FIXTURES['client.online'].values['client.status']).toBe('online');
    expect(WEBHOOK_EVENT_FIXTURES['p2p.connected'].values['p2p.state']).toBe('connected');
    expect(WEBHOOK_EVENT_FIXTURES['p2p.fallback'].values['p2p.state']).toBe('fallback');
  });

  test('renders Header values in plaintext', () => {
    const request = renderWebhookRequest(webhook({
      events: ['client.online'],
      headers: [{ id: 'authorization', key: 'Authorization', value: 'Bearer demo-client-token' }],
    }), 'client.online');

    expect(request.headers).toEqual([{ key: 'Authorization', value: 'Bearer demo-client-token' }]);
  });
});
