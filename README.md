# GovQuest

GovQuest is a web platform that helps people navigate Ethiopian public-service processes through clear, step-by-step task flows, community tips, and progress tracking.

## Features

- Process guides with nested, drill-down tasks
- Quest-style progress tracking with resumable state
- Community tips per task with voting
- User authentication (email/password + Google OAuth)
- In-app feedback submission with email delivery
- Production-ready Docker deployment

## Tech Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Better Auth
- SurrealDB (graph model)
- Nodemailer
- Docker Compose

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 10+
- Docker + Docker Compose

### 1) Install dependencies

```bash
pnpm install
```

### 2) Configure environment

```bash
cp .env.example .env
```

Set required values in `.env` before running the app.

### 3) Start local services

```bash
pnpm db:up
pnpm dev
```

Local URLs:

- App: `http://localhost:3000`
- MailHog: `http://localhost:8025`

Stop local services:

```bash
pnpm db:down
```

## Available Scripts

- `pnpm dev` - start Next.js in development mode
- `pnpm build` - create production build
- `pnpm start` - run production server
- `pnpm typecheck` - run TypeScript checks
- `pnpm db:up` - start local DB + seed
- `pnpm db:down` - stop local DB stack
- `pnpm db:logs` - tail DB/seed logs
- `pnpm db:catalog:enrich` - enrich process/task metadata (task outputs + map links)
- `pnpm db:catalog:build` - rebuild production catalog seed
- `pnpm db:schema:apply` - apply production schema service
- `pnpm prod:up` - start production compose stack
- `pnpm prod:down` - stop production compose stack

## Data Workflow

`surreal/schema-and-seed.surql` is the source of truth for process/task content.

Before shipping content updates:

```bash
pnpm db:catalog:build
```

This regenerates `surreal/catalog-prod.surql` and applies metadata enrichment (task output artifacts and map links).

## Production Deployment

1. Configure `.env` with production values.
2. Build and start containers:

```bash
docker compose up -d --build
```

3. Place a reverse proxy (TLS termination) in front of port `3000`.

To stop the production stack:

```bash
docker compose down
```

## Authentication Notes

Google sign-in requires valid `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`, and matching callback/domain configuration in Google Cloud Console.

## Contributing

1. Create a branch
2. Make changes
3. Run checks (`pnpm typecheck`, `pnpm build`)
4. Open a pull request with a clear change summary

## License

This project currently has no license file. Add one before distributing or accepting external contributions.
