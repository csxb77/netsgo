-- Name: 012_tunnel_resource_locks_constraints
-- Description: Rebuild tunnel resource locks with tunnel ownership and resource kind constraints.
-- CreatedAt: 2026-07-30T00:00:00Z

-- Up:
ALTER TABLE tunnel_resource_locks RENAME TO tunnel_resource_locks_unconstrained_migration;

CREATE TABLE tunnel_resource_locks (
	resource_key TEXT PRIMARY KEY,
	tunnel_id TEXT NOT NULL REFERENCES tunnels(id) ON DELETE CASCADE,
	resource_kind TEXT NOT NULL CHECK (resource_kind IN (
		'server_tcp_port',
		'client_tcp_port',
		'server_udp_port',
		'client_udp_port',
		'server_http_host'
	)),
	client_id TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL
);

INSERT INTO tunnel_resource_locks (resource_key, tunnel_id, resource_kind, client_id, created_at)
SELECT
	CASE
		WHEN ingress_type IN ('tcp_listen', 'socks5_listen') THEN
			'ingress:' || ingress_location ||
			CASE WHEN ingress_client_id <> '' THEN ':' || ingress_client_id ELSE '' END ||
			':tcp:' || COALESCE(NULLIF(ingress_bind_ip, ''), '0.0.0.0') || ':' || ingress_port
		WHEN ingress_type = 'udp_listen' THEN
			'ingress:' || ingress_location ||
			CASE WHEN ingress_client_id <> '' THEN ':' || ingress_client_id ELSE '' END ||
			':udp:' || COALESCE(NULLIF(ingress_bind_ip, ''), '0.0.0.0') || ':' || ingress_port
		WHEN ingress_type = 'http_host' THEN
			'ingress:' || ingress_location ||
			CASE WHEN ingress_client_id <> '' THEN ':' || ingress_client_id ELSE '' END ||
			':http_host:' || lower(ingress_domain)
	END,
	id,
	CASE
		WHEN ingress_type IN ('tcp_listen', 'socks5_listen') AND ingress_location = 'client' THEN 'client_tcp_port'
		WHEN ingress_type IN ('tcp_listen', 'socks5_listen') THEN 'server_tcp_port'
		WHEN ingress_type = 'udp_listen' AND ingress_location = 'client' THEN 'client_udp_port'
		WHEN ingress_type = 'udp_listen' THEN 'server_udp_port'
		WHEN ingress_type = 'http_host' THEN 'server_http_host'
	END,
	ingress_client_id,
	created_at
FROM tunnels
WHERE (ingress_type IN ('tcp_listen', 'socks5_listen', 'udp_listen') AND ingress_port > 0)
   OR (ingress_type = 'http_host' AND ingress_domain <> '');

DROP TABLE tunnel_resource_locks_unconstrained_migration;

CREATE INDEX idx_tunnel_resource_locks_tunnel ON tunnel_resource_locks(tunnel_id);
CREATE INDEX idx_tunnel_resource_locks_client ON tunnel_resource_locks(client_id);

-- Down:
ALTER TABLE tunnel_resource_locks RENAME TO tunnel_resource_locks_constrained_migration;

CREATE TABLE tunnel_resource_locks (
	resource_key TEXT PRIMARY KEY,
	tunnel_id TEXT NOT NULL,
	resource_kind TEXT NOT NULL,
	client_id TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL
);

INSERT INTO tunnel_resource_locks (resource_key, tunnel_id, resource_kind, client_id, created_at)
SELECT resource_key, tunnel_id, resource_kind, client_id, created_at
FROM tunnel_resource_locks_constrained_migration;

DROP TABLE tunnel_resource_locks_constrained_migration;

CREATE INDEX idx_tunnel_resource_locks_tunnel ON tunnel_resource_locks(tunnel_id);
CREATE INDEX idx_tunnel_resource_locks_client ON tunnel_resource_locks(client_id);
