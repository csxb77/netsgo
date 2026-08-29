package server

import "fmt"

type WebhookLocale string

const (
	WebhookLocaleEnglish WebhookLocale = "en-US"
	WebhookLocaleChinese WebhookLocale = "zh-CN"
)

type webhookLocalizedEvent struct {
	Name    string
	Summary string
	Reason  string
}

var webhookEventNames = map[WebhookLocale]map[string]string{
	WebhookLocaleEnglish: {
		"client.online":            "Client online",
		"client.offline":           "Client offline",
		"tunnel.stopped":           "Tunnel stopped",
		"tunnel.resumed":           "Tunnel re-enabled",
		"tunnel.runtime_changed":   "Tunnel runtime state changed",
		"tunnel.runtime_error":     "Tunnel runtime error",
		"tunnel.runtime_recovered": "Tunnel runtime recovered",
		"p2p.checking":             "P2P checking",
		"p2p.connected":            "P2P connected",
		"p2p.failed":               "P2P connection failed",
		"p2p.fallback":             "P2P fell back to Server relay",
		"p2p.session_closed":       "P2P session closed",
	},
	WebhookLocaleChinese: {
		"client.online":            "客户端上线",
		"client.offline":           "客户端离线",
		"tunnel.stopped":           "隧道已停止",
		"tunnel.resumed":           "隧道已重新启用",
		"tunnel.runtime_changed":   "隧道运行状态改变",
		"tunnel.runtime_error":     "隧道运行异常",
		"tunnel.runtime_recovered": "隧道已从异常中恢复",
		"p2p.checking":             "P2P 检查中",
		"p2p.connected":            "P2P 已直连",
		"p2p.failed":               "P2P 直连失败",
		"p2p.fallback":             "回退到 Server 中继",
		"p2p.session_closed":       "P2P 会话关闭",
	},
}

var webhookEventSummaryFormats = map[WebhookLocale]map[string]string{
	WebhookLocaleEnglish: {
		"client.online":            "%s came online",
		"client.offline":           "%s went offline",
		"tunnel.stopped":           "%s was stopped",
		"tunnel.resumed":           "%s was re-enabled",
		"tunnel.runtime_changed":   "%s runtime state changed",
		"tunnel.runtime_error":     "%s encountered a runtime error",
		"tunnel.runtime_recovered": "%s recovered from a runtime error",
	},
	WebhookLocaleChinese: {
		"client.online":            "%s 已上线",
		"client.offline":           "%s 已离线",
		"tunnel.stopped":           "%s 已停止",
		"tunnel.resumed":           "%s 已重新启用",
		"tunnel.runtime_changed":   "%s 运行状态已改变",
		"tunnel.runtime_error":     "%s 运行异常",
		"tunnel.runtime_recovered": "%s 已从运行异常中恢复",
	},
}

var webhookReasonTexts = map[WebhookLocale]map[string]string{
	WebhookLocaleEnglish: {
		"normal_closure":      "The client closed the connection normally",
		"server_shutdown":     "The Server is shutting down or restarting",
		"transport_error":     "The client connection was interrupted",
		"timeout":             "Timed out waiting for the data channel",
		"user_disabled":       "The owner was disabled",
		"data_channel_closed": "The data channel closed",
		"replaced":            "A newer client connection took over",
		"start_failed":        "The tunnel runtime failed to start",
		"restore_failed":      "The tunnel runtime could not be restored",
		"reconcile_failed":    "Tunnel configuration failed to apply",
		"negotiation_failed":  "P2P direct-connect negotiation failed",
		"direct_only_failed":  "Direct-only transport could not be established",
		"lease_unhealthy":     "P2P session health checks failed",
		"lease_expired":       "The P2P session timed out",
		"participant_offline": "A P2P participant client went offline",
		"tunnel_stopped":      "The tunnel was stopped",
		"tunnel_deleted":      "The tunnel was deleted",
		"revision_replaced":   "The tunnel configuration was replaced",
		"unknown":             "Unknown reason",
	},
	WebhookLocaleChinese: {
		"normal_closure":      "客户端正常关闭连接",
		"server_shutdown":     "Server 正在关闭或重启",
		"transport_error":     "客户端连接意外中断",
		"timeout":             "等待数据通道建立超时",
		"user_disabled":       "所属用户已被停用",
		"data_channel_closed": "数据通道已关闭",
		"replaced":            "较新的客户端连接已接管",
		"start_failed":        "隧道运行态启动失败",
		"restore_failed":      "隧道运行态恢复失败",
		"reconcile_failed":    "隧道配置下发失败",
		"negotiation_failed":  "P2P 直连协商失败",
		"direct_only_failed":  "无法建立仅直连传输",
		"lease_unhealthy":     "P2P 会话健康检查失败",
		"lease_expired":       "P2P 会话已超时",
		"participant_offline": "一名 P2P 参与客户端已离线",
		"tunnel_stopped":      "隧道已停止",
		"tunnel_deleted":      "隧道已删除",
		"revision_replaced":   "隧道配置已被替换",
		"unknown":             "未知原因",
	},
}

func supportedWebhookLocales() []WebhookLocale {
	return []WebhookLocale{WebhookLocaleEnglish, WebhookLocaleChinese}
}

// localizeWebhookEvent renders human-readable text for one locale. The locale
// must come from supportedWebhookLocales().
func localizeWebhookEvent(snapshot webhookEventSnapshot, locale WebhookLocale) webhookLocalizedEvent {
	name := webhookEventNames[locale][snapshot.Type]
	if name == "" {
		name = snapshot.Type
	}
	summary := name
	if format := webhookEventSummaryFormats[locale][snapshot.Type]; format != "" {
		subjectName := ""
		if len(snapshot.Clients) == 1 {
			subjectName = snapshot.Clients[0].Name
		} else if len(snapshot.Tunnels) == 1 {
			subjectName = snapshot.Tunnels[0].Name
		}
		if subjectName != "" {
			summary = fmt.Sprintf(format, subjectName)
		}
	}
	reason := ""
	if snapshot.ReasonCode != "" {
		reason = webhookReasonTexts[locale][snapshot.ReasonCode]
		if reason == "" {
			reason = webhookReasonTexts[locale]["unknown"]
		}
	}
	return webhookLocalizedEvent{Name: name, Summary: summary, Reason: reason}
}
