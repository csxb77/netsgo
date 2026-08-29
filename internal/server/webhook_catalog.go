package server

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

const defaultActivityWebhookBody = `{
  "schema_version": 1,
  "delivery": {
    "id": "{{delivery.id}}",
    "attempt": "{{delivery.attempt}}"
  },
  "event": {
    "id": "{{event.id}}",
    "type": "{{event.type}}",
    "name": {
      "zh-CN": "{{event.name.zh-CN}}",
      "en-US": "{{event.name.en-US}}"
    },
    "summary": {
      "zh-CN": "{{event.summary.zh-CN}}",
      "en-US": "{{event.summary.en-US}}"
    },
    "occurred_at": "{{event.occurred_at}}",
    "severity": "{{event.severity}}",
    "reason_code": "{{event.reason_code}}",
    "reason": {
      "zh-CN": "{{event.reason.zh-CN}}",
      "en-US": "{{event.reason.en-US}}"
    },
    "expected": "{{event.expected}}",
    "data": "{{event.data}}"
  },
  "subjects": {
    "clients": "{{subjects.clients}}",
    "tunnels": "{{subjects.tunnels}}"
  },
  "matched_target_ids": "{{match.target_ids}}"
}`

type WebhookCatalogEvent struct {
	Key        string            `json:"key"`
	TargetKind WebhookTargetKind `json:"target_kind"`
	Family     string            `json:"family"`
}

type WebhookCatalog struct {
	Events      []WebhookCatalogEvent     `json:"events"`
	Variables   []WebhookVariable         `json:"variables"`
	Fixtures    map[string]map[string]any `json:"fixtures"`
	DefaultBody string                    `json:"default_body"`
	Locales     []WebhookLocale           `json:"locales"`
}

type webhookClientSnapshot struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Hostname string `json:"hostname,omitempty"`
	Relation string `json:"relation,omitempty"`
}

type webhookTunnelSnapshot struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Type         string `json:"type,omitempty"`
	Topology     string `json:"topology,omitempty"`
	Relation     string `json:"relation,omitempty"`
	RuntimeState string `json:"runtime_state,omitempty"`
}

type webhookEventSnapshot struct {
	ID               string                  `json:"id"`
	Type             string                  `json:"type"`
	Severity         string                  `json:"severity"`
	OccurredAt       string                  `json:"occurred_at"`
	ReasonCode       string                  `json:"reason_code"`
	Expected         bool                    `json:"expected"`
	Data             map[string]any          `json:"data"`
	Clients          []webhookClientSnapshot `json:"clients"`
	Tunnels          []webhookTunnelSnapshot `json:"tunnels"`
	MatchedTargetIDs []string                `json:"matched_target_ids"`
}

func activityWebhookCatalog() WebhookCatalog {
	events := []WebhookCatalogEvent{
		{Key: "client.online", TargetKind: WebhookTargetClient, Family: "client"},
		{Key: "client.offline", TargetKind: WebhookTargetClient, Family: "client"},
		{Key: "tunnel.stopped", TargetKind: WebhookTargetTunnel, Family: "tunnel"},
		{Key: "tunnel.resumed", TargetKind: WebhookTargetTunnel, Family: "tunnel"},
		{Key: "tunnel.runtime_changed", TargetKind: WebhookTargetTunnel, Family: "tunnel"},
		{Key: "tunnel.runtime_error", TargetKind: WebhookTargetTunnel, Family: "tunnel"},
		{Key: "tunnel.runtime_recovered", TargetKind: WebhookTargetTunnel, Family: "tunnel"},
		{Key: "p2p.checking", TargetKind: WebhookTargetTunnel, Family: "p2p"},
		{Key: "p2p.connected", TargetKind: WebhookTargetTunnel, Family: "p2p"},
		{Key: "p2p.failed", TargetKind: WebhookTargetTunnel, Family: "p2p"},
		{Key: "p2p.fallback", TargetKind: WebhookTargetTunnel, Family: "p2p"},
		{Key: "p2p.session_closed", TargetKind: WebhookTargetTunnel, Family: "p2p"},
	}
	variables := webhookCatalogVariables()
	fixtures := make(map[string]map[string]any, len(events))
	for _, event := range events {
		snapshot := sampleWebhookEvent(event.Key)
		fixtures[event.Key] = snapshot.values("dlv_sample_"+strings.ReplaceAll(event.Key, ".", "_"), "wh_sample", "Test webhook")
	}
	return WebhookCatalog{Events: events, Variables: variables, Fixtures: fixtures, DefaultBody: defaultActivityWebhookBody, Locales: supportedWebhookLocales()}
}

func webhookCatalogVariables() []WebhookVariable {
	all := "all"
	every := []string{"url", "header", "body"}
	body := []string{"body"}
	clients := []string{"client.online", "client.offline"}
	tunnels := []string{"tunnel.stopped", "tunnel.resumed", "tunnel.runtime_changed", "tunnel.runtime_error", "tunnel.runtime_recovered"}
	return []WebhookVariable{
		{Key: "delivery.id", Group: "delivery", ValueType: "text", Surfaces: every, AvailableForEvents: all},
		{Key: "delivery.attempt", Group: "delivery", ValueType: "number", Surfaces: body, AvailableForEvents: all},
		{Key: "event.id", Group: "event", ValueType: "text", Surfaces: every, AvailableForEvents: all},
		{Key: "event.type", Group: "event", ValueType: "text", Surfaces: every, AvailableForEvents: all},
		{Key: "event.name.zh-CN", Group: "event", ValueType: "text", Surfaces: every, AvailableForEvents: all},
		{Key: "event.name.en-US", Group: "event", ValueType: "text", Surfaces: every, AvailableForEvents: all},
		{Key: "event.summary.zh-CN", Group: "event", ValueType: "text", Surfaces: every, AvailableForEvents: all},
		{Key: "event.summary.en-US", Group: "event", ValueType: "text", Surfaces: every, AvailableForEvents: all},
		{Key: "event.severity", Group: "event", ValueType: "text", Surfaces: every, AvailableForEvents: all},
		{Key: "event.occurred_at", Group: "event", ValueType: "text", Surfaces: every, AvailableForEvents: all},
		{Key: "event.reason_code", Group: "event", ValueType: "text", Surfaces: every, AvailableForEvents: all, Optional: true},
		{Key: "event.reason.zh-CN", Group: "event", ValueType: "text", Surfaces: every, AvailableForEvents: all, Optional: true},
		{Key: "event.reason.en-US", Group: "event", ValueType: "text", Surfaces: every, AvailableForEvents: all, Optional: true},
		{Key: "event.expected", Group: "event", ValueType: "boolean", Surfaces: body, AvailableForEvents: all},
		{Key: "event.data", Group: "event", ValueType: "json", Surfaces: body, AvailableForEvents: all},
		{Key: "subjects.clients", Group: "subjects", ValueType: "json", Surfaces: body, AvailableForEvents: all},
		{Key: "subjects.tunnels", Group: "subjects", ValueType: "json", Surfaces: body, AvailableForEvents: all},
		{Key: "subjects.client_ids_csv", Group: "subjects", ValueType: "text", Surfaces: every, AvailableForEvents: all},
		{Key: "subjects.tunnel_ids_csv", Group: "subjects", ValueType: "text", Surfaces: every, AvailableForEvents: all},
		{Key: "match.target_ids", Group: "match", ValueType: "json", Surfaces: body, AvailableForEvents: all},
		{Key: "match.target_ids_csv", Group: "match", ValueType: "text", Surfaces: every, AvailableForEvents: all},
		{Key: "client.id", Group: "client", ValueType: "text", Surfaces: every, AvailableForEvents: clients},
		{Key: "client.name", Group: "client", ValueType: "text", Surfaces: every, AvailableForEvents: clients},
		{Key: "client.hostname", Group: "client", ValueType: "text", Surfaces: every, AvailableForEvents: clients, Optional: true},
		{Key: "tunnel.id", Group: "tunnel", ValueType: "text", Surfaces: every, AvailableForEvents: tunnels},
		{Key: "tunnel.name", Group: "tunnel", ValueType: "text", Surfaces: every, AvailableForEvents: tunnels},
		{Key: "tunnel.type", Group: "tunnel", ValueType: "text", Surfaces: every, AvailableForEvents: tunnels, Optional: true},
		{Key: "tunnel.topology", Group: "tunnel", ValueType: "text", Surfaces: every, AvailableForEvents: tunnels, Optional: true},
		{Key: "tunnel.runtime_state", Group: "tunnel", ValueType: "text", Surfaces: every, AvailableForEvents: tunnels},
		{Key: "webhook.id", Group: "webhook", ValueType: "text", Surfaces: every, AvailableForEvents: all},
		{Key: "webhook.name", Group: "webhook", ValueType: "text", Surfaces: every, AvailableForEvents: all},
	}
}

func sampleWebhookEvent(eventType string) webhookEventSnapshot {
	now := "2026-08-21T10:42:16+08:00"
	client := webhookClientSnapshot{ID: "client_test_node", Name: "Test client node", Hostname: "test-client-node"}
	peer := webhookClientSnapshot{ID: "client_test_peer", Name: "Test peer node", Hostname: "test-peer-node"}
	serviceTunnel := webhookTunnelSnapshot{ID: "tunnel_test_service", Name: "Test service tunnel", Type: "https", Topology: "server_expose", RuntimeState: "active"}
	p2pTunnel := webhookTunnelSnapshot{ID: "tunnel_test_p2p", Name: "Test P2P tunnel", Type: "tcp", Topology: "client_to_client", RuntimeState: "active"}
	snapshot := webhookEventSnapshot{ID: "evt_sample_" + strings.ReplaceAll(eventType, ".", "_"), Type: eventType, OccurredAt: now, Expected: true, Data: map[string]any{}}
	switch eventType {
	case "client.online":
		snapshot.Severity, snapshot.Clients, snapshot.MatchedTargetIDs = "info", []webhookClientSnapshot{client}, []string{client.ID}
		snapshot.Data = map[string]any{"status": "online"}
	case "client.offline":
		snapshot.Severity, snapshot.ReasonCode, snapshot.Expected = "warning", "transport_error", false
		snapshot.Clients, snapshot.MatchedTargetIDs = []webhookClientSnapshot{client}, []string{client.ID}
		snapshot.Data = map[string]any{"status": "offline", "reason_code": snapshot.ReasonCode}
	case "tunnel.stopped":
		serviceTunnel.RuntimeState = "idle"
		snapshot.Severity, snapshot.Tunnels, snapshot.MatchedTargetIDs = "info", []webhookTunnelSnapshot{serviceTunnel}, []string{serviceTunnel.ID}
		snapshot.Data = map[string]any{"before": "running", "after": "stopped"}
	case "tunnel.resumed":
		snapshot.Severity, snapshot.Tunnels, snapshot.MatchedTargetIDs = "info", []webhookTunnelSnapshot{serviceTunnel}, []string{serviceTunnel.ID}
		snapshot.Data = map[string]any{"before": "stopped", "after": "running"}
	case "tunnel.runtime_changed":
		snapshot.Severity, snapshot.Tunnels, snapshot.MatchedTargetIDs = "debug", []webhookTunnelSnapshot{serviceTunnel}, []string{serviceTunnel.ID}
		snapshot.Data = map[string]any{"before": "pending", "after": "active", "revision": 18}
	case "tunnel.runtime_error":
		serviceTunnel.RuntimeState = "error"
		snapshot.Severity, snapshot.ReasonCode, snapshot.Expected = "error", "start_failed", false
		snapshot.Tunnels, snapshot.MatchedTargetIDs = []webhookTunnelSnapshot{serviceTunnel}, []string{serviceTunnel.ID}
		snapshot.Data = map[string]any{"before": "pending", "after": "error", "reason_code": snapshot.ReasonCode}
	case "tunnel.runtime_recovered":
		snapshot.Severity, snapshot.Tunnels, snapshot.MatchedTargetIDs = "info", []webhookTunnelSnapshot{serviceTunnel}, []string{serviceTunnel.ID}
		snapshot.Data = map[string]any{"before": "error", "after": "active"}
	case "p2p.checking", "p2p.connected", "p2p.failed", "p2p.fallback", "p2p.session_closed":
		state := strings.TrimPrefix(eventType, "p2p.")
		snapshot.Severity = "info"
		if state == "checking" {
			snapshot.Severity = "debug"
		}
		if state == "failed" || state == "fallback" {
			snapshot.Severity, snapshot.Expected = "warning", false
		}
		snapshot.ReasonCode = map[string]string{"failed": "negotiation_failed", "fallback": "negotiation_failed", "session_closed": "tunnel_stopped"}[state]
		snapshot.Clients = []webhookClientSnapshot{client, peer}
		snapshot.Tunnels = []webhookTunnelSnapshot{p2pTunnel, serviceTunnel}
		snapshot.MatchedTargetIDs = []string{p2pTunnel.ID, serviceTunnel.ID}
		snapshot.Data = map[string]any{"state": state, "reason_code": snapshot.ReasonCode}
	}
	return snapshot
}

func (snapshot webhookEventSnapshot) values(deliveryID, webhookID, webhookName string) map[string]any {
	clientIDs := make([]string, 0, len(snapshot.Clients))
	for _, client := range snapshot.Clients {
		clientIDs = append(clientIDs, client.ID)
	}
	tunnelIDs := make([]string, 0, len(snapshot.Tunnels))
	for _, tunnel := range snapshot.Tunnels {
		tunnelIDs = append(tunnelIDs, tunnel.ID)
	}
	values := map[string]any{
		"delivery.id": deliveryID, "delivery.attempt": 1,
		"event.id": snapshot.ID, "event.type": snapshot.Type,
		"event.severity": snapshot.Severity, "event.occurred_at": snapshot.OccurredAt,
		"event.reason_code": snapshot.ReasonCode,
		"event.expected": snapshot.Expected, "event.data": snapshot.Data,
		"subjects.clients": snapshot.Clients, "subjects.tunnels": snapshot.Tunnels,
		"subjects.client_ids_csv": strings.Join(clientIDs, ","), "subjects.tunnel_ids_csv": strings.Join(tunnelIDs, ","),
		"match.target_ids": snapshot.MatchedTargetIDs, "match.target_ids_csv": strings.Join(snapshot.MatchedTargetIDs, ","),
		"webhook.id": webhookID, "webhook.name": webhookName,
	}
	for _, locale := range supportedWebhookLocales() {
		localized := localizeWebhookEvent(snapshot, locale)
		values["event.name."+string(locale)] = localized.Name
		values["event.summary."+string(locale)] = localized.Summary
		values["event.reason."+string(locale)] = localized.Reason
	}
	if len(snapshot.Clients) == 1 && strings.HasPrefix(snapshot.Type, "client.") {
		values["client.id"], values["client.name"] = snapshot.Clients[0].ID, snapshot.Clients[0].Name
		values["client.hostname"] = snapshot.Clients[0].Hostname
	}
	if len(snapshot.Tunnels) == 1 && strings.HasPrefix(snapshot.Type, "tunnel.") {
		values["tunnel.id"], values["tunnel.name"] = snapshot.Tunnels[0].ID, snapshot.Tunnels[0].Name
		values["tunnel.type"], values["tunnel.topology"] = snapshot.Tunnels[0].Type, snapshot.Tunnels[0].Topology
		values["tunnel.runtime_state"] = snapshot.Tunnels[0].RuntimeState
	}
	return values
}

func webhookEventSnapshotFromPrepared(activityID int64, prepared preparedActivitySpec, matchedTargetIDs []string) (webhookEventSnapshot, error) {
	var data map[string]any
	if err := json.Unmarshal(prepared.payloadJSON, &data); err != nil {
		return webhookEventSnapshot{}, fmt.Errorf("decode activity payload for Webhook: %w", err)
	}
	eventType := string(prepared.category) + "." + prepared.action
	reasonCode, _ := data["reason_code"].(string)
	snapshot := webhookEventSnapshot{
		ID: fmt.Sprintf("%d", activityID), Type: eventType,
		Severity: string(prepared.severity), OccurredAt: prepared.occurredAt.Format(time.RFC3339Nano),
		ReasonCode: reasonCode, Expected: webhookEventExpected(eventType, reasonCode), Data: data,
		Clients:          make([]webhookClientSnapshot, 0, len(prepared.clients)),
		Tunnels:          make([]webhookTunnelSnapshot, 0, len(prepared.tunnels)),
		MatchedTargetIDs: append([]string(nil), matchedTargetIDs...),
	}
	for _, subject := range prepared.clients {
		name := subject.DisplayName
		if strings.TrimSpace(name) == "" {
			name = subject.Hostname
		}
		if name == "" {
			name = subject.ClientID
		}
		snapshot.Clients = append(snapshot.Clients, webhookClientSnapshot{ID: subject.ClientID, Name: name, Hostname: subject.Hostname, Relation: subject.Relation})
	}
	for _, subject := range prepared.tunnels {
		name := subject.Name
		if name == "" {
			name = subject.TunnelID
		}
		runtimeState := ""
		if after, ok := data["after"].(string); ok {
			runtimeState = after
		}
		if eventType == "tunnel.runtime_error" {
			runtimeState = "error"
		}
		snapshot.Tunnels = append(snapshot.Tunnels, webhookTunnelSnapshot{ID: subject.TunnelID, Name: name, Type: subject.Type, Topology: subject.Topology, Relation: subject.Relation, RuntimeState: runtimeState})
	}
	sort.Strings(snapshot.MatchedTargetIDs)
	return snapshot, nil
}

func webhookEventExpected(eventType, reason string) bool {
	switch eventType {
	case "client.offline":
		return reason == "normal_closure" || reason == "server_shutdown" || reason == "user_disabled" || reason == "replaced"
	case "tunnel.runtime_error", "p2p.failed", "p2p.fallback":
		return false
	case "p2p.session_closed":
		return reason != "lease_unhealthy" && reason != "lease_expired"
	default:
		return true
	}
}
