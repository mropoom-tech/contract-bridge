# REFERENCES — Official documents consulted on 2026-11-17

Links are reference material, **not** a guarantee that packages or pricing stay unchanged. Claude should check the latest official stable documentation before committing deploy configuration.

## Cloudflare / Hono

1. [Cloudflare: React + Vite to Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/) — official React SPA + Worker setup.
2. [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/) — stable plugin guidance; v2 described as beta in Nov 2026.
3. [Cloudflare React SPA + API tutorial](https://developers.cloudflare.com/workers/vite-plugin/tutorial/) — recommended integrated Workers setup.
4. [Hono: Cloudflare Workers + Vite](https://hono.dev/docs/getting-started/cloudflare-workers-vite) — Hono integration path.
5. [Cloudflare Durable Objects Overview](https://developers.cloudflare.com/durable-objects/) — SQLite DO support on Workers Free.
6. [Cloudflare Durable Object class exports](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/) — current declarative `exports` vs legacy migration mechanisms.
7. [Cloudflare Durable Objects WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) — hibernatable WS API, attachment lifecycle, avoid pinning idle DO.
8. [Cloudflare WebSocket Hibernation example](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/) — concrete pattern.
9. [Cloudflare D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/) — local and remote migrations.
10. [Cloudflare GitHub Actions deployment](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) — Wrangler action and GitHub secrets.
11. [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/) — quotas and limits.
12. [Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) — Free/Paid limits and charges.

## Bridge rules

13. [World Bridge Federation: 2017 Laws of Duplicate Bridge](https://www.worldbridge.org/regulations/2017-laws-of-duplicate-bridge/) — official Laws, see amendments published 2023 effective Jan 1, 2024.
14. [ACBL: Laws of Duplicate Bridge / Law 77 Scoring Table](https://cdn.acbl.org/documentLibrary/play/Laws-of-Duplicate-Bridge.pdf) — contract points, game, slam, overtrick, doubled undertrick penalties.

## Implementation interpretation

- This MVP implements ordinary legal-play flow, not tournament Director rulings. It simplifies opening lead to immediate face-up play and notes this explicitly.
- Cloudflare docs now discuss **declarative DO `exports`** for new projects, while older tutorials still show `new_sqlite_classes` in `migrations`; never configure both for the same namespace.
- As of Nov 2026 SQLite-backed DOs are available on Free Tier. This does not make usage unlimited.
