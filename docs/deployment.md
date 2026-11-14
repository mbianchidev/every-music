# Deployment and operations

[Documentation index](README.md) | [Complete configuration](configuration.md) | [Usage and troubleshooting](usage.md)

Every.music runs anywhere you can run two containers next to PostgreSQL 16. The
Docker Compose setup is the reference proof of concept; the same images run on
any container host, PaaS, or Kubernetes cluster. Nothing in the application
depends on a specific cloud provider: databases, object storage, SMTP, push
providers, TLS, and logging are all configured through standard interfaces.

## Building blocks

| Component | Compose proof of concept | Elsewhere |
|---|---|---|
| API | `realm-nexus` image from `backend/Dockerfile` | Same image on any container runtime, one or more replicas |
| Web client | `spectrum-web` nginx image from `frontend/Dockerfile` | Same image, or the static `frontend/dist` build on any static host/CDN |
| Database | `postgres:16-alpine` with a named volume | Any managed or self-run PostgreSQL 16+ allowing `uuid-ossp` and `pg_trgm` |
| Media bytes | PostgreSQL, or SeaweedFS with the `object-storage` profile | Any S3-compatible bucket (AWS S3, Cloudflare R2, Google Cloud Storage interoperability, MinIO, SeaweedFS, ...) |
| Email | Any SMTP submission service | Any provider offering authenticated SMTP with STARTTLS |
| TLS | Not included; ports bind to loopback | Reverse proxy, load balancer, or ingress controller |
| Push (optional) | VAPID Web Push, FCM, APNs | Same; outbound HTTPS only |

## Required configuration

Copy `.env.example` to the deployment secret store. Do not commit `.env`.

Required production values:

- `POSTGRES_PASSWORD`
- `CIPHER_PRIMARY_KEY`
- `CIPHER_REFRESH_KEY`
- `MAIL_GATEWAY`
- `MAIL_IDENTITY`
- `MAIL_CREDENTIAL`
- `MAIL_SENDER_ALIAS`

The signing keys must be different and at least 32 characters. Rotating either key invalidates the corresponding active tokens.

Set `PORTAL_ORIGINS` to a comma-separated allowlist. Include Tauri origins only when packaged clients are supported:

```text
https://every.music,http://tauri.localhost,tauri://localhost
```

## Containers

```bash
docker compose build --no-cache
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:8080/health/ready
curl --fail http://127.0.0.1/healthz
```

The API container runs database migrations before accepting traffic. The web and API ports bind to loopback by default; place them behind a TLS reverse proxy for internet access.

### Optional object storage in Compose

The `object-storage` profile adds `object-store`, a single-node SeaweedFS
S3 gateway with its data in the `everymusic-object-volume` volume. It creates
the bucket (`S3_BUCKET`, default `everymusic-media`) on startup, requires
signed requests with the configured key pair, and has its own healthcheck. The
API reports not ready until the bucket answers, so the web service starts only
after both are up. Without the profile, Compose behaves exactly as before and
stores media in PostgreSQL. Add to `.env`:

```text
COMPOSE_PROFILES=object-storage
MEDIA_STORAGE=s3
S3_ACCESS_KEY_ID=<random access key>
S3_SECRET_ACCESS_KEY=<different long random secret>
```

```bash
docker compose up -d
curl --fail http://127.0.0.1:8080/health/ready
```

Readiness then includes `"storage":"connected"`. Uploads made before the switch
stay in PostgreSQL and remain readable. The S3 port binds to `127.0.0.1:8333`
for inspection (`OBJECT_STORE_PORT`); the API reaches it as
`http://object-store:8333`. Back up the object volume together with PostgreSQL.
A single SeaweedFS node is suited to small installations; use a replicated
SeaweedFS/MinIO cluster or a managed bucket for production durability.

## Deploy anywhere

### Container images

Build versioned images and push them to any OCI registry you control:

```bash
docker build -t registry.example.com/everymusic/api:1.0.0 backend
docker build -t registry.example.com/everymusic/web:1.0.0 \
  --build-arg VITE_API_BASE_URL=/realm frontend
docker push registry.example.com/everymusic/api:1.0.0
docker push registry.example.com/everymusic/web:1.0.0
```

- The API image runs as a non-root user, listens on `NEXUS_PORT` (8080), applies
  migrations, then starts. It works with a read-only root filesystem and a
  writable `/tmp`. Configure it only through environment variables or mounted
  secret files exported as variables.
- The web image runs nginx as a non-root user on port 8080 and proxies `/realm/`
  to the host name `realm-nexus:8080`. Either give the API that internal name
  (a Kubernetes Service or a network alias), or serve the web build on its own
  origin with `VITE_API_BASE_URL=https://api.example.com/realm` and add that web
  origin to `PORTAL_ORIGINS`. `VITE_*` values are compiled in, so build one web
  image per public API URL.
- Path-based routing also works: route `/realm/*` to the API and everything else
  to the web image or static files on the same HTTPS origin.

### Managed PostgreSQL

1. Create a PostgreSQL 16+ database and a role that owns it. The role must be
   able to create the `uuid-ossp` and `pg_trgm` extensions once.
2. Set `REALM_CONNECTION`, for example
   `postgresql://everymusic:<password>@db.example.com:5432/everymusic?sslmode=verify-full`.
   If the provider's CA is not publicly trusted, mount it and set
   `NODE_EXTRA_CA_CERTS=/path/to/ca.pem`.
3. Initialize the **empty** database once with the schema and catalogs, as the
   Compose database container does on its first start, from a repository checkout:

   ```bash
   docker run --rm -v "$PWD/backend/database:/database:ro" postgres:16-alpine \
     psql "$REALM_CONNECTION" -v ON_ERROR_STOP=1 -f /database/schema.sql \
     -f /database/seeds/instruments.sql -f /database/seeds/genres.sql
   ```

   The API applies outstanding migrations on every start. To run them as a
   separate release step instead:

   ```bash
   docker run --rm -e REALM_ENV=production -e REALM_CONNECTION -e CIPHER_PRIMARY_KEY -e CIPHER_REFRESH_KEY \
     registry.example.com/everymusic/api:1.0.0 node scripts/migrate-realm.js
   ```

   Never initialize or `bootstrap` an existing database; `bootstrap` is for
   disposable development databases only.
4. Size `max_connections` for `replicas x (REALM_POOL_MAX + 1)` plus maintenance
   connections. Each API process keeps one dedicated `LISTEN` connection.
   Transaction-mode poolers (such as PgBouncer in transaction mode) break
   `LISTEN/NOTIFY`; connect the API directly or through a session-mode pool.
5. Enable automated backups and point-in-time recovery, and test restores.

### Object storage

Set `MEDIA_STORAGE=s3` and the `S3_*` [settings](configuration.md#media-storage).
The bucket stays private: the API signs every request and serves media itself,
so no bucket CORS, public access, or CDN is needed.

| Service | `S3_ENDPOINT` | `S3_REGION` | `S3_FORCE_PATH_STYLE` |
|---|---|---|---|
| AWS S3 | Unset (or `https://s3.<region>.amazonaws.com`) | Bucket region | `false` |
| Cloudflare R2 | `https://<account-id>.r2.cloudflarestorage.com` | `auto` | `true` |
| Google Cloud Storage (HMAC keys) | `https://storage.googleapis.com` | `auto` | `true` |
| MinIO / SeaweedFS | `http(s)://<host>:<port>` | `us-east-1` | `true` |

Existing PostgreSQL media keeps working after the switch. To move it into the
bucket, run `node scripts/move-media-to-object-storage.js` from the API image
with the production settings; the command is resumable.

Use credentials scoped to that one bucket (get, put, delete, list/head). Enable
encryption at rest and versioning or replication as your retention policy
requires. Object keys are `media/<uuid>`; objects never contain account data
beyond the uploaded bytes. Deleted media is removed from the bucket by the
background worker; failures are retried and logged.

### Email (SMTP)

Any provider offering authenticated SMTP submission works: a transactional email
service, your organization's mail server, or a self-hosted MTA. Use port 587
with STARTTLS (implicit TLS on 465 is not supported), a verified sender domain
with SPF, DKIM, and DMARC, and set the four `MAIL_*` values. The API logs SMTP
failures; registration is kept so users can resend verification.

### TLS and reverse proxies

- Terminate TLS at your proxy, load balancer, or ingress and forward plain HTTP
  to the containers on a private network. Redirect HTTP to HTTPS and send HSTS.
- Set `TRUST_PROXY=true` only when every request passes through that proxy, so
  client IPs (used by rate limits) come from `X-Forwarded-For`.
- Put the public HTTPS web origin first in `PORTAL_ORIGINS`.
- Disable response buffering and allow idle timeouts above 15 seconds for
  `/realm/events` (server-sent events).
- Allow request bodies of at least `ATTACHMENT_BYTE_LIMIT` (10 MiB by default)
  on `/realm/media/blobs`; the bundled nginx allows 11 MiB.

### Running several API processes

The API is stateless apart from PostgreSQL and object storage, so you can run
any number of replicas behind a load balancer without sticky sessions:

- Sessions and refresh tokens live in PostgreSQL.
- Live updates use PostgreSQL `LISTEN/NOTIFY`: every replica listens and fans
  events out to its own server-sent-event clients, so a change on one replica
  reaches users connected to any other.
- Background work (push delivery, hourly maintenance, media object deletion)
  runs in every replica and leases rows with `FOR UPDATE SKIP LOCKED`, so jobs
  are never processed twice and keep running if a replica stops.
- Startup migrations take a PostgreSQL advisory lock, so replicas starting
  together apply each migration once. Running `node scripts/migrate-realm.js`
  as a separate release job is still recommended for large upgrades.
- Rate limits are counted per process; with N replicas a client can make up to
  N times `RATE_THRESHOLD` requests per window. Lower the threshold or enforce
  limits at the proxy as well.
- Each replica allows 1,000 event streams and three per user.

### Generic container host

Any platform that runs OCI images with environment variables, a health check,
and private networking works. Run the API with:

```bash
docker run -d --name realm-nexus --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges:true -p 127.0.0.1:8080:8080 \
  -e REALM_ENV=production -e NODE_ENV=production -e TRUST_PROXY=true \
  -e REALM_CONNECTION -e CIPHER_PRIMARY_KEY -e CIPHER_REFRESH_KEY \
  -e MAIL_GATEWAY -e MAIL_IDENTITY -e MAIL_CREDENTIAL -e MAIL_SENDER_ALIAS \
  -e PORTAL_ORIGINS=https://every.example.com \
  -e MEDIA_STORAGE=s3 -e S3_ENDPOINT -e S3_REGION -e S3_BUCKET \
  -e S3_ACCESS_KEY_ID -e S3_SECRET_ACCESS_KEY -e S3_FORCE_PATH_STYLE \
  registry.example.com/everymusic/api:1.0.0
```

Configure the platform's readiness probe as `GET /health/ready` and its
liveness/restart probe as `GET /health/live` on port 8080.

### Kubernetes

A minimal, provider-neutral layout: a Secret with the variables above, an API
Deployment and a Service named `realm-nexus` (the bundled nginx proxies to that
name), a web Deployment and Service, and an Ingress with TLS. Apply your
cluster's own policies for resources, network policy, and secret management.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: realm-nexus
spec:
  replicas: 2
  selector:
    matchLabels: { app: realm-nexus }
  template:
    metadata:
      labels: { app: realm-nexus }
    spec:
      securityContext: { runAsNonRoot: true }
      containers:
        - name: api
          image: registry.example.com/everymusic/api:1.0.0
          ports: [{ containerPort: 8080 }]
          envFrom: [{ secretRef: { name: everymusic-api } }]
          env:
            - { name: REALM_ENV, value: production }
            - { name: NODE_ENV, value: production }
            - { name: TRUST_PROXY, value: "true" }
          readinessProbe: { httpGet: { path: /health/ready, port: 8080 }, periodSeconds: 10 }
          livenessProbe: { httpGet: { path: /health/live, port: 8080 }, periodSeconds: 20 }
          securityContext:
            readOnlyRootFilesystem: true
            allowPrivilegeEscalation: false
            capabilities: { drop: [ALL] }
          volumeMounts: [{ name: tmp, mountPath: /tmp }]
      volumes: [{ name: tmp, emptyDir: {} }]
---
apiVersion: v1
kind: Service
metadata:
  name: realm-nexus
spec:
  selector: { app: realm-nexus }
  ports: [{ port: 8080, targetPort: 8080 }]
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: spectrum-web
spec:
  replicas: 2
  selector:
    matchLabels: { app: spectrum-web }
  template:
    metadata:
      labels: { app: spectrum-web }
    spec:
      containers:
        - name: web
          image: registry.example.com/everymusic/web:1.0.0
          ports: [{ containerPort: 8080 }]
          readinessProbe: { httpGet: { path: /healthz, port: 8080 } }
          securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: [ALL] } }
---
apiVersion: v1
kind: Service
metadata:
  name: spectrum-web
spec:
  selector: { app: spectrum-web }
  ports: [{ port: 80, targetPort: 8080 }]
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: everymusic
spec:
  tls: [{ hosts: [every.example.com], secretName: everymusic-tls }]
  rules:
    - host: every.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: spectrum-web, port: { number: 80 } } }
```

Configure your ingress controller to stream `/realm/events` without buffering
and with a read timeout above 15 seconds. Run `node scripts/migrate-realm.js`
from the API image as a Job (or rely on the startup lock) before rolling out a
new version.

## Upgrading

1. Create a PostgreSQL backup in secure storage outside the checkout and test its
   restore into an isolated database. Confirm which application revision and
   schema the backup belongs to.
2. Review the intended revision's migrations and configuration changes.
   Obtain that reviewed revision without overwriting local secrets or data.
3. Run `docker compose build --no-cache`, then `docker compose up -d`.
   The API applies outstanding migrations before listening.
4. Check `docker compose ps`, readiness, and API logs. Exercise user workflows
   with synthetic accounts in staging, including SMTP verification/reset delivery.
5. Retain the backup and previous application artifacts until the upgrade is
   accepted. Application rollback does not reverse a schema migration; use a
   planned restore or compatible forward fix rather than assuming it is safe.

Outside Compose, run `npm run migrate` from `backend/` as a release step before
starting the API. Never run `bootstrap` against an existing database.
See [data lifecycle](usage.md#upgrades-stopping-and-uninstalling) for shutdown
and volume behavior, and [native release delivery](releases.md) for client builds.

## Health model

- `GET /health/live`: process is running.
- `GET /health/ready`: PostgreSQL is reachable and, with `MEDIA_STORAGE=s3`, the media bucket answers.
- `GET /pulse`: compatibility alias for readiness.

Use readiness for load balancer admission. Use liveness only for process restart decisions.

## Database

- Back up PostgreSQL before every schema migration.
- Test restore procedures, not only backup creation.
- Keep the database private; the Compose port binds to `127.0.0.1` by default.
- Monitor connection saturation against `REALM_POOL_MAX`.
- Allow one extra dedicated LISTEN connection per API process for live updates.
- Include uploaded image bytes, private messages, notification settings, and push
  subscriptions/devices in backup protection. Media is stored in PostgreSQL by
  default, or in the configured bucket with `MEDIA_STORAGE=s3`; never in a local
  upload directory. Back up the bucket (versioning or replication) together with
  the database, because rows reference object keys. Restrict administrative
  access and restore copies.
- Migration 003 installs `pg_trgm` and creates search indexes transactionally.
  Use a suitable maintenance window for large tables; see
  [migration verification](development.md#community-api-migration-and-browser-tests).
- Run `npm run migrate` as a dedicated release step outside Compose when the platform separates migrations from application startup.

## Email

Registration remains committed if SMTP delivery fails. Users can request another verification email through the sign-in screen. Monitor SMTP failures because unverified accounts cannot sign in.

## Tokens and sessions

- Access tokens default to 30 minutes.
- Refresh sessions default to 30 days and are revocable.
- Refresh tokens rotate on use. A 30-second deterministic grace window lets a client recover the same replacement after a lost response; later reuse revokes all sessions for the account.
- Password reset revokes all refresh sessions for the account.
- Stored refresh, verification, and reset tokens are SHA-256 hashes in PostgreSQL.

## Observability

Fastify emits structured JSON logs in production. Collect stdout/stderr and alert on:

- readiness failures
- SMTP initialization or send failures
- repeated `RATE_LIMIT_EXCEEDED`
- authentication lookup failures
- migration failures
- uncaught exceptions or unhandled rejections
- live-listener disconnects and repeated stream reconnections
- push delivery failures, exhausted retries, and subscription/device cleanup
- `MEDIA_STORAGE_UNAVAILABLE` responses, storage readiness failures, and stored media object deletion failures
- community maintenance failures

Configure [Google and Web Push](configuration.md#google-web-sign-in) only when
needed. VAPID private keys belong in the secret store. Use HTTPS and preserve
the public key pair across deployments. Disable upstream proxy buffering for
`/realm/events`; its heartbeat interval is 15 seconds. Browser installation and
push do not replace native platform release verification.

Operational logs can contain request IPs and URLs. Apply the host's appropriate
log retention/access controls independently of the opt-in analytics aggregates.
Never add Authorization headers, message text, Google credentials, or push
endpoint/key details to logs.

## Release checklist

1. `npm ci`, tests, builds, and production dependency audits are green.
2. `cargo check --locked` is green.
3. Database backup and rollback plan are confirmed.
4. Required environment variables and origin allowlists are reviewed.
5. `docker compose build --no-cache` succeeds.
6. Deployment readiness passes, and the backend smoke test passes in an isolated staging database.
7. TLS, DNS, SMTP, PostgreSQL and object storage backups, and log collection are configured by the hosting platform.
8. Native packaging has a reviewed HTTPS API URL ending in `/realm`, supplied through `DESKTOP_API_BASE_URL` or the manual workflow input; follow [release verification](releases.md).
