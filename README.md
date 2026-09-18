# Manyama Scanner

Manyama Scanner is a demo/paper-only trading automation platform scaffold built for a mobile-first AI trading cockpit.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: Express + TypeScript
- Shared logic: typed trading, risk, and scanner services
- Testing: Vitest

## Execution model

This first release is intentionally limited to paper-only behavior.

- No live broker credentials or secrets are stored
- No live `OrderSend()` path is enabled
- MT5 bridge is a demo-only heartbeat and status architecture
- Screenshot analysis is analysis-only and never auto-executes

## Development

```bash
npm install
npm run dev
```

The web app runs at `http://localhost:5173` and the API runs at `http://localhost:4000`.

## Production build

```bash
npm run build
```

## Test and validation

```bash
npm run test
npm run typecheck
npm run lint
```
