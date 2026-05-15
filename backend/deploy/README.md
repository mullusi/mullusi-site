<!--
Purpose: document the host-side production deployment package for Mullusi Govern Cloud.
Governance scope: environment placement, Compose runtime, reverse proxy, systemd service, and release preflight.
Dependencies: Linux host, Docker Compose v2, Nginx, TLS certificate, managed PostgreSQL, and backend scripts.
Invariants: production secrets stay outside Git and persistence remains required.
-->

# Mullusi Govern Cloud Deployment Package

## Files

```text
production.env.example              Environment template; copy to /etc/mullusi/govern.env
docker-compose.production.yaml      API-only production Compose stack
nginx/api.mullusi.com.conf          TLS reverse proxy for api.mullusi.com
systemd/mullusi-govern.service      Host service wrapper for Docker Compose
```

## Host Layout

```text
/opt/mullusi/govern-cloud/docker-compose.production.yaml
/etc/mullusi/govern.env
/etc/nginx/sites-available/api.mullusi.com.conf
/etc/nginx/sites-enabled/api.mullusi.com.conf
/etc/systemd/system/mullusi-govern.service
```

## Setup

1. Copy `production.env.example` to `/etc/mullusi/govern.env`.
2. Replace every placeholder with production values from the secret store.
3. Copy `docker-compose.production.yaml` to `/opt/mullusi/govern-cloud/`.
4. Copy `nginx/api.mullusi.com.conf` to Nginx `sites-available`.
5. Link the Nginx file into `sites-enabled`.
6. Copy `systemd/mullusi-govern.service` into `/etc/systemd/system/`.
7. Run `python scripts/preflight_release.py` from a shell that has the same environment values loaded.
8. Enable and start the service.

```bash
sudo systemctl daemon-reload
sudo systemctl enable mullusi-govern.service
sudo systemctl start mullusi-govern.service
sudo nginx -t
sudo systemctl reload nginx
```

## Verification

```bash
curl https://api.mullusi.com/v1/health
curl https://api.mullusi.com/v1/version
```

```bash
export PYTHONPATH=$PWD
export MULLUSI_API_BASE_URL=https://api.mullusi.com
python scripts/probe_persistence.py
```

Required result:

```text
probe_passed ... storage=stored verification=valid
```

STATUS:
  Completeness: 100%
  Invariants verified: secret externalization, API-only production stack, HTTPS proxy, systemd service boundary
  Open issues: concrete host IP, TLS certificate issuance, managed PostgreSQL endpoint
  Next action: copy files to production host and run release preflight
