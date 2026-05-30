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

Create `.env.local` and set `AI_PROVIDER_API_KEY`; optionally set `AI_PROVIDER_BASE_URL`, `AI_PROVIDER_FAST_MODEL`, `AI_PROVIDER_FLAGSHIP_MODEL`, and backup provider variables to route simple vs complex requests and fail over when the primary provider is unavailable. Set `SDK_OPERATIONS_DATABASE_PATH` to choose the local SQLite file for conversations, memories, and tool-call logs. Set `NEXT_PUBLIC_CONVERSATION_HISTORY_CHAR_LIMIT` to control when browser-side conversation history compacts old messages into a summary.

## Run

```bash
bun run dev
```

Open <http://localhost:3000> in your browser.

## Database schema

Saved AI touchpoints use a lightweight local SQLite database at `SDK_OPERATIONS_DATABASE_PATH` (`./data/sdk-operations.sqlite` by default):

- `users`: normalized student identity and display name.
- `conversations`: saved conversation title, summary, and timestamps per user.
- `conversation_turns`: ordered user/assistant/system turns per saved conversation.
- `memories`: editable long-term memory facts per user.
- `tool_call_logs`: every tool-call attempt, outcome, policy snapshot, and timestamp.

## Conversations

The model tester keeps each conversation separate and can save/load conversations in a lightweight local SQLite database. Saved conversations and long-term memory facts are partitioned by the Student name field, so enter the same student name later to load that student's saved conversations and memories.

Long conversations are automatically compacted when they pass `NEXT_PUBLIC_CONVERSATION_HISTORY_CHAR_LIMIT`: older messages are moved into an older-context summary while recent turns remain verbatim. Long-term memory facts can be saved separately and are reused in future requests, including brand-new conversations for the same student. When many memories exist, only keyword-relevant memories are sent, capped to a small context budget so responses stay focused. Users can view, edit, and delete saved memories, clear a specific conversation's stored history, or delete a saved conversation from the database.

## Tool calling

The AI flow exposes function tools from one registry in `src/lib/ai-tools.ts`, so adding a tool means adding one registry entry with a `definition`, `policy`, `validate`, and `run` handler. Current tools:

- `count_text_characters`: read-only; use for exact character counts. Input: `text`; output: original text and `characterCount`.
- `normalize_sdk_name`: read-only; use for canonical SDK name formatting. Input: `sdkName`; output: original and normalized names.

Every tool call is validated before execution and logged with `type: "ai_tool_call"` to stdout and the SQLite `tool_call_logs` table. Tools marked as requiring confirmation are blocked until explicit confirmation support is added, and destructive tools are never allowed to run autonomously. The model can call tools repeatedly in one request: `src/lib/ai-text.ts` feeds each tool result back to the model for another decision, capped at 4 tool-call rounds before forcing a final answer with tool use disabled.

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
