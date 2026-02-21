# GovQuest

GovQuest is a Next.js app for Ethiopian process guides with SurrealDB.

## Run

```bash
pnpm install
docker compose up -d surrealdb surreal-seed
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
pnpm typecheck
pnpm build
```
