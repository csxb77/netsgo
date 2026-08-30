package server

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestWebhookCatalogLocalizesHumanVariablesAndUsesGenericFixtures(t *testing.T) {
	catalog := activityWebhookCatalog()
	online := catalog.Fixtures["client.online"]
	if online["event.name.zh-CN"] != "客户端上线" || online["event.name.en-US"] != "Client online" {
		t.Fatalf("localized online names = (%#v, %#v)", online["event.name.zh-CN"], online["event.name.en-US"])
	}
	if online["event.summary.zh-CN"] != "Test client node 已上线" || online["event.summary.en-US"] != "Test client node came online" {
		t.Fatalf("localized online summaries = (%#v, %#v)", online["event.summary.zh-CN"], online["event.summary.en-US"])
	}
	if online["client.name"] != "Test client node" {
		t.Fatalf("sample client name = %#v", online["client.name"])
	}
	if online["event.reason_code"] != "" || online["event.reason.zh-CN"] != "" || online["event.reason.en-US"] != "" {
		t.Fatalf("online reasons = (%#v, %#v, %#v), want empty", online["event.reason_code"], online["event.reason.zh-CN"], online["event.reason.en-US"])
	}
	offline := catalog.Fixtures["client.offline"]
	if offline["event.reason_code"] != "transport_error" ||
		offline["event.reason.zh-CN"] != "客户端连接意外中断" ||
		offline["event.reason.en-US"] != "The client connection was interrupted" {
		t.Fatalf("localized offline reasons = (%#v, %#v, %#v)", offline["event.reason_code"], offline["event.reason.zh-CN"], offline["event.reason.en-US"])
	}

	if len(catalog.Locales) != len(supportedWebhookLocales()) {
		t.Fatalf("catalog locales = %#v", catalog.Locales)
	}

	raw, err := json.Marshal(catalog.Fixtures)
	if err != nil {
		t.Fatal(err)
	}
	for _, specific := range []string{"香港节点", "深圳渲染节点", "CRM HTTPS", "hk-edge"} {
		if strings.Contains(string(raw), specific) {
			t.Fatalf("Webhook fixtures should not contain environment-specific sample %q", specific)
		}
	}
}

func TestWebhookLocalizedCatalogCoversEventsAndReasons(t *testing.T) {
	catalog := activityWebhookCatalog()
	for _, event := range catalog.Events {
		values := catalog.Fixtures[event.Key]
		for _, locale := range supportedWebhookLocales() {
			if values["event.name."+string(locale)] == "" || values["event.summary."+string(locale)] == "" {
				t.Fatalf("event %q is missing %q human text", event.Key, locale)
			}
		}
	}
	for _, action := range []string{"offline", "runtime_error", "failed", "fallback", "session_closed"} {
		for reason := range activityReasonAllowlist[action] {
			snapshot := webhookEventSnapshot{Type: "client.offline", ReasonCode: reason}
			values := snapshot.values("dlv", "wh", "Webhook")
			for _, locale := range supportedWebhookLocales() {
				if values["event.reason."+string(locale)] == "" {
					t.Fatalf("reason %q is missing %q human text", reason, locale)
				}
			}
		}
	}
}

func TestWebhookEventSummaryPreservesRealSubjectName(t *testing.T) {
	snapshot := webhookEventSnapshot{
		Type:    "client.online",
		Clients: []webhookClientSnapshot{{ID: "client-real", Name: "自定义节点名称"}},
	}
	values := snapshot.values("dlv", "wh", "Webhook")
	if values["event.summary.zh-CN"] != "自定义节点名称 已上线" {
		t.Fatalf("Chinese summary = %#v", values["event.summary.zh-CN"])
	}
	if values["event.summary.en-US"] != "自定义节点名称 came online" {
		t.Fatalf("English summary = %#v", values["event.summary.en-US"])
	}
}
