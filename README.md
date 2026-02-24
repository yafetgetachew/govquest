# GovQuest

GovQuest is a Next.js app for Ethiopian process guides with SurrealDB.

## Local Development

Prerequisites: Docker + Docker Compose, Node 20+, pnpm.

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm dev
```

- App: [http://localhost:3000](http://localhost:3000)
- MailHog: [http://localhost:8025](http://localhost:8025)
- `pnpm db:up` uses `/Users/morph/Projects/gvt/docker-compose.dev.yml` and imports `/Users/morph/Projects/gvt/surreal/schema-and-seed.surql` (destructive seed, dev-only).

To stop local DB/services:

```bash
pnpm db:down
```

## Production Deploy

1. Copy env file and set real values:

```bash
cp .env.example .env
```

Required production values include:
- `BETTER_AUTH_SECRET` (32+ chars)
- `SURREALDB_USER`, `SURREALDB_PASS`
- `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `TRUSTED_ORIGINS`
- SMTP settings (`SMTP_*`)

2. Build and start:

```bash
docker compose up -d --build
```

This uses `/Users/morph/Projects/gvt/docker-compose.yml` (non-destructive schema import from `/Users/morph/Projects/gvt/surreal/schema.surql`).

Production also imports `/Users/morph/Projects/gvt/surreal/catalog-prod.surql` for the process/task graph.
It also applies `/Users/morph/Projects/gvt/surreal/migrations/001-default-field-semantics.surql` on startup to keep mutable fields (`started.progress_percent`, `started.active`, etc.) writable.

When you add or update processes in `/Users/morph/Projects/gvt/surreal/schema-and-seed.surql`, rebuild and commit the production catalog before deploying:

```bash
pnpm db:catalog:build
```

`pnpm db:catalog:build` now auto-runs enrichment to ensure each task has an `output` artifact and to add Google Maps links for process/task locations where available.

3. Put Nginx/Caddy in front of port `3000` for TLS and set DNS to your domain.

To stop production stack:

```bash
docker compose down
```
