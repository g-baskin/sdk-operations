# sdk-operations

A Bun-managed Next.js app for testing OpenAI-compatible AI providers through a single configurable server-side client.

## Key structure

- `src/app/page.tsx` renders the home page and `ModelTester`.
- `src/app/model-tester.tsx` is the client UI for sending text with either normal or streaming responses, keeping session history, compacting long histories, saving/loading/clearing conversations, and viewing/editing/deleting long-term memory facts in browser local storage partitioned by student name.
- `src/app/api/model/route.ts` owns `POST /api/model`, validates input, selects normal vs streaming response mode, and maps AI failures to clear responses.
- `src/lib/openai-client.ts` owns the singleton OpenAI SDK client and provider config.
- `src/lib/ai-text.ts` owns `generateText` and `streamText`; all model text requests should route through these helpers. Tool calls can run for up to `maxToolCallIterations` rounds before a final no-tool response is forced.
- `src/lib/ai-system-prompt.ts` owns the system prompt template and request-time dynamic context builder automatically sent with every AI request.
- `src/lib/ai-tools.ts` defines the function-tool registry; add new tools by adding one registry entry with a `definition`, `policy`, `validate`, and `run` handler. Tool calls are logged, validated before execution, and blocked when marked destructive or confirmation-required.
- `src/lib/ai-errors.ts` and `src/lib/ai-retry.ts` own provider error mapping and short retry/backoff behavior.
- `src/app/globals.css` contains Tailwind v4 globals and theme variables.

## AI provider configuration

- Runtime provider settings come from environment variables, not code changes.
- Required: `AI_PROVIDER_API_KEY`.
- Optional: `AI_PROVIDER_BASE_URL` for OpenAI-compatible providers such as OpenRouter.
- Optional: `AI_PROVIDER_FAST_MODEL` for straightforward requests and `AI_PROVIDER_FLAGSHIP_MODEL` for complex or explicitly flagship requests.
- Optional backup provider variables use the `AI_BACKUP_PROVIDER_*` prefix and are tried when primary provider calls fail or rate-limit.
- Real secrets belong in `.env.local`, which is ignored by Git.
- Streaming responses are plain `text/plain` chunks, not SSE.
- `NEXT_PUBLIC_CONVERSATION_HISTORY_CHAR_LIMIT` controls browser-side history compaction before old turns are summarized and recent turns are preserved.
- Long-term memory retrieval is keyword relevance-based in `src/app/model-tester.tsx`, with client/server/model-context caps so only focused memories are sent.

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
