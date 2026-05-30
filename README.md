# sdk-operations

A public Next.js workspace for SDK operations, built with Bun, TypeScript, Tailwind CSS, and Biome.

## Requirements

- Bun 1.3.14 or newer
- Node.js 22.21.1 or newer

## Install

```bash
bun install
```

## Environment

Create `.env.local` and set `AI_PROVIDER_API_KEY`; optionally set `AI_PROVIDER_BASE_URL`, `AI_PROVIDER_FAST_MODEL`, `AI_PROVIDER_FLAGSHIP_MODEL`, and backup provider variables to route simple vs complex requests and fail over when the primary provider is unavailable.

## Run

```bash
bun run dev
```

Open <http://localhost:3000> in your browser.

## Quality checks

```bash
bun run check
bun run typecheck
bun run build
```

## Branch flow

Changes flow from `dev` to `qa` to `main`.

## License

MIT
