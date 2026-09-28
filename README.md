# Survive Drive — Valhalla

This repository's `main` branch is the **primary development baseline** for Survive Drive as of September 28, 2026. New Survive Drive features and fixes should start from this Valhalla version.

The current development Site is [survive-drive-valhalla.choppy777.chatgpt.site](https://survive-drive-valhalla.choppy777.chatgpt.site/) (`appgprj_6abaa02b28f0819189305df71487726c`). The existing HERE-based Site at [choppy.fans](https://choppy.fans) remains available at its current address. Moving the public main address is a separate decision.

Valhalla routing, Escape Gate cross-product searches, and route evaluation are implemented here. The Valhalla service is hosted locally on this computer; the Site needs that local connection for route searches. No traffic integration is planned yet.

## Working on this project

- Edit the source files in `dist/` and `server/`. `node build.mjs` copies browser assets into `dist/client/` and regenerates `dist/server/index.js` for publishing.
- Keep the Escape Gate mechanism unless the user explicitly approves changing it. Preserve the full start/destination cross product, including the no-gate pair.
- Run relevant offline checks before publishing. `check-round-zero-initial.mjs`, `check-ranking-evolution.mjs`, `check-route-quota.mjs`, and `check-pool-quota-server.mjs` cover the current Round 0 and AVM quota behavior.
- Do not use live Valhalla, Census, or RentCast requests as tests. Provider attempts, including failures, consume their stated budgets.

The Site is identified by `.openai/hosting.json`. Keep that project ID with this source; the HERE Site is a distinct deployment.
