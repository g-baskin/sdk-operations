# sdk-operations

A Bun-managed Next.js app for testing OpenAI-compatible AI providers through a single configurable server-side client.

## Key structure

- `src/app/page.tsx` renders the home page and `ModelTester`.
- `src/app/model-tester.tsx` is the client UI for sending one text input with either normal or streaming responses.
- `src/app/api/model/route.ts` owns `POST /api/model`, validates input, selects normal vs streaming response mode, and maps AI failures to clear responses.
- `src/lib/openai-client.ts` owns the singleton OpenAI SDK client and provider config.
- `src/lib/ai-text.ts` owns `generateText` and `streamText`; all model text requests should route through these helpers.
- `src/lib/ai-errors.ts` and `src/lib/ai-retry.ts` own provider error mapping and short retry/backoff behavior.
- `src/app/globals.css` contains Tailwind v4 globals and theme variables.

## AI provider configuration

- Runtime provider settings come from environment variables, not code changes.
- Required: `AI_PROVIDER_API_KEY`.
- Optional: `AI_PROVIDER_BASE_URL` for OpenAI-compatible providers such as OpenRouter.
- Optional: `AI_PROVIDER_MODEL`; defaults to `gpt-4.1-mini` in `src/lib/openai-client.ts`.
- Real secrets belong in `.env.local`, which is ignored by Git.
- Streaming responses are plain `text/plain` chunks, not SSE.

## Commands

- Install: `bun install`.
- Dev server: `bun run dev` (`next dev --turbopack`).
- Production build: `bun run build` (`next build --turbopack`).
- Start built app: `bun run start`.
- Biome lint: `bun run lint`.
- Biome check: `bun run check`.
- Format write: `bun run format`.
- Format check: `bun run format:check`.
- TypeScript check: `bun run typecheck`.

## Project-specific workflow notes

- Branch flow is `dev` -> `qa` -> `main`; current working branch is `dev`.
- This repo has no test script or test directory yet.
- `public/` is currently empty.

@AGENTS.md
