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

func TestWebhookLocalizedCatalogCoversEvents(t *testing.T) {
	catalog := activityWebhookCatalog()
	for _, event := range catalog.Events {
		values := catalog.Fixtures[event.Key]
		for _, locale := range supportedWebhookLocales() {
			if values["event.name."+string(locale)] == "" || values["event.summary."+string(locale)] == "" {
				t.Fatalf("event %q is missing %q human text", event.Key, locale)
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
