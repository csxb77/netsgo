package server

import (
	"errors"
	"net"
	"net/url"
	"strconv"
)

// WebhookSettings controls server-wide outbound Webhook policy.
type WebhookSettings struct {
	// AllowPrivateTargets permits Webhook delivery to loopback, RFC1918,
	// link-local, and other non-public addresses. It is disabled by default so
	// a user cannot turn the Server into an SSRF pivot into its own network.
	AllowPrivateTargets bool `json:"allow_private_targets"`
	// DailyDeliveryCap bounds how many test and replay deliveries a single
	// user may enqueue per rolling 24h window. Event-driven deliveries are not
	// counted, so legitimate activity traffic is never dropped.
	DailyDeliveryCap int `json:"daily_delivery_cap"`
}

const (
	defaultWebhookDailyDeliveryCap = 50
	maxWebhookDailyDeliveryCap     = 10000
)

func defaultWebhookSettings() WebhookSettings {
	return WebhookSettings{AllowPrivateTargets: false, DailyDeliveryCap: defaultWebhookDailyDeliveryCap}
}

var errInvalidWebhookSettings = errors.New("webhook daily delivery cap must be between 1 and " + strconv.Itoa(maxWebhookDailyDeliveryCap))

func validateWebhookSettings(settings WebhookSettings) error {
	if settings.DailyDeliveryCap < 1 || settings.DailyDeliveryCap > maxWebhookDailyDeliveryCap {
		return errInvalidWebhookSettings
	}
	return nil
}

// webhookAddressAllowed reports whether an IP may receive Webhook traffic when
// private targets are disabled. Loopback, RFC1918, unique-local, link-local,
// multicast, unspecified, and CGNAT (100.64.0.0/10) addresses are rejected.
func webhookAddressAllowed(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() || ip.IsUnspecified() {
		return false
	}
	if v4 := ip.To4(); v4 != nil && v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127 {
		return false
	}
	return true
}

// webhookHostBlocked reports whether a URL hostname resolves (or literals
// point) exclusively or partially to non-public addresses. Hosts that cannot
// be resolved at validation time are allowed through; the dispatcher's dial
// guard re-checks the resolved address before connecting, which also closes
// the DNS-rebinding window.
func webhookHostBlocked(host string) bool {
	host = urlHostname(host)
	if host == "" {
		return true
	}
	if ip := net.ParseIP(host); ip != nil {
		return !webhookAddressAllowed(ip)
	}
	ips, err := net.LookupIP(host)
	if err != nil {
		return false
	}
	for _, ip := range ips {
		if !webhookAddressAllowed(ip) {
			return true
		}
	}
	return false
}

func urlHostname(host string) string {
	parsed, err := url.Parse("://" + host)
	if err != nil {
		return ""
	}
	return parsed.Hostname()
}

// validWebhookHeaderValue mirrors net/http's header-value rules closely enough
// for rendered Webhook headers: printable bytes plus tab, without CR/LF/NUL.
func validWebhookHeaderValue(value string) bool {
	for i := 0; i < len(value); i++ {
		c := value[i]
		if c == '\t' {
			continue
		}
		if c < 0x20 || c == 0x7f {
			return false
		}
	}
	return true
}
