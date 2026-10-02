# Life OS frontend

Next.js/TypeScript frontend for the local Life OS API. Use the
[repository setup](../../README.md#first-time-setup) and start both services with
`uv run life-os-dev` from the repository root.

For frontend-only work, with the backend already running:

```sh
npm --prefix apps/web run dev
```

`LIFE_OS_API_URL` configures the backend URL for server-side requests; the local
launcher supplies the localhost default. Keep backend secrets out of browser code.

## Checks

From the repository root:

```sh
npm --prefix apps/web test
npm --prefix apps/web run lint
npm --prefix apps/web run build
```

Read [frontend instructions](AGENTS.md) and only the relevant bundled Next.js guide
when changing frontend code. Keep domain rules in the backend and use existing
shared actions/views. [The documentation index](../../docs/README.md) routes product
contracts. Deployment is separate future scope; this README does not prescribe a
hosting provider.
