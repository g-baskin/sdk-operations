"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type ModelResponse = {
  output?: unknown;
  error?: unknown;
  toolResults?: unknown;
};

type ConversationTurn = {
  content: string;
  id: string;
  role: "assistant" | "system" | "user";
};

type MemoryFact = {
  content: string;
  id: string;
  updatedAt: string;
};

type RequestMode = "idle" | "standard" | "streaming";

type SavedConversation = {
  history: ConversationTurn[];
  id: string;
  summary: string;
  title: string;
  updatedAt: string;
};

const savedConversationStoragePrefix = "sdk-operations:conversations";
const savedMemoryStoragePrefix = "sdk-operations:memories";
const defaultConversationHistoryCharLimit = 12000;
const maxRelevantMemoryChars = 2500;
const maxRelevantMemoryCount = 8;
const recentTurnCountToKeep = 8;

function getConversationHistoryCharLimit(): number {
  const configuredLimit = Number.parseInt(
    process.env.NEXT_PUBLIC_CONVERSATION_HISTORY_CHAR_LIMIT ?? "",
    10,
  );

  if (Number.isFinite(configuredLimit) && configuredLimit > 1000) {
    return configuredLimit;
  }

  return defaultConversationHistoryCharLimit;
}

function getConversationUserKey(userName: string): string | undefined {
  const normalizedName = userName.trim().toLowerCase();

  if (normalizedName.length === 0) {
    return undefined;
  }

  return normalizedName.replace(/[^a-z0-9_-]+/g, "-");
}

function getConversationStorageKey(userName: string): string | undefined {
  const userKey = getConversationUserKey(userName);

  return userKey ? `${savedConversationStoragePrefix}:${userKey}` : undefined;
}

function getMemoryStorageKey(userName: string): string | undefined {
  const userKey = getConversationUserKey(userName);

  return userKey ? `${savedMemoryStoragePrefix}:${userKey}` : undefined;
}

function getConversationSize(
  history: readonly ConversationTurn[],
  summary: string,
): number {
  return (
    summary.length +
    history.reduce(
      (total, turn) => total + turn.content.length + turn.role.length,
      0,
    )
  );
}

function createCompactedSummary({
  existingSummary,
  oldTurns,
}: {
  existingSummary: string;
  oldTurns: readonly ConversationTurn[];
}): string {
  const oldTurnText = oldTurns
    .map((turn) => `${turn.role}: ${turn.content}`)
    .join("\n");

  return [
    existingSummary ? `Prior summary:\n${existingSummary}` : undefined,
    oldTurnText
      ? `Older messages condensed for continuity:\n${oldTurnText}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(-Math.floor(getConversationHistoryCharLimit() / 2));
}

function compactConversationHistory({
  history,
  summary,
}: {
  history: readonly ConversationTurn[];
  summary: string;
}): { history: ConversationTurn[]; summary: string } {
  const historyLimit = getConversationHistoryCharLimit();

  if (getConversationSize(history, summary) <= historyLimit) {
    return { history: [...history], summary };
  }

  const recentTurns = history.slice(-recentTurnCountToKeep);
  const oldTurns = history.slice(0, -recentTurnCountToKeep);
  let nextSummary = createCompactedSummary({
    existingSummary: summary,
    oldTurns,
  });
  let nextHistory = [...recentTurns];

  while (
    nextHistory.length > 2 &&
    getConversationSize(nextHistory, nextSummary) > historyLimit
  ) {
    const [oldestTurn, ...remainingTurns] = nextHistory;
    nextSummary = createCompactedSummary({
      existingSummary: nextSummary,
      oldTurns: oldestTurn ? [oldestTurn] : [],
    });
    nextHistory = remainingTurns;
  }

  return { history: nextHistory, summary: nextSummary };
}

function isConversationTurn(value: unknown): value is ConversationTurn {
  if (!value || typeof value !== "object") {
    return false;
  }

  const turn = value as Partial<ConversationTurn>;

  return (
    typeof turn.content === "string" &&
    typeof turn.id === "string" &&
    (turn.role === "assistant" ||
      turn.role === "system" ||
      turn.role === "user")
  );
}

function isMemoryFact(value: unknown): value is MemoryFact {
  if (!value || typeof value !== "object") {
    return false;
  }

  const memory = value as Partial<MemoryFact>;

  return (
    typeof memory.content === "string" &&
    typeof memory.id === "string" &&
    typeof memory.updatedAt === "string"
  );
}

function isSavedConversation(value: unknown): value is SavedConversation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const conversation = value as Partial<SavedConversation>;

  return (
    Array.isArray(conversation.history) &&
    conversation.history.every(isConversationTurn) &&
    typeof conversation.id === "string" &&
    (conversation.summary === undefined ||
      typeof conversation.summary === "string") &&
    typeof conversation.title === "string" &&
    typeof conversation.updatedAt === "string"
  );
}

function readSavedConversations(userName: string): SavedConversation[] {
  const storageKey = getConversationStorageKey(userName);

  if (!storageKey) {
    return [];
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);

    if (!storedValue) {
      return [];
    }

    const parsedValue = JSON.parse(storedValue) as unknown;

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .filter(isSavedConversation)
      .map((conversation) => ({
        ...conversation,
        summary: conversation.summary ?? "",
      }))
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  } catch {
    return [];
  }
}

function writeSavedConversations(
  userName: string,
  conversations: readonly SavedConversation[],
): void {
  const storageKey = getConversationStorageKey(userName);

  if (!storageKey) {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(conversations));
}

function readSavedMemories(userName: string): MemoryFact[] {
  const storageKey = getMemoryStorageKey(userName);

  if (!storageKey) {
    return [];
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);

    if (!storedValue) {
      return [];
    }

    const parsedValue = JSON.parse(storedValue) as unknown;

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .filter(isMemoryFact)
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  } catch {
    return [];
  }
}

function writeSavedMemories(
  userName: string,
  memories: readonly MemoryFact[],
): void {
  const storageKey = getMemoryStorageKey(userName);

  if (!storageKey) {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(memories));
}

function getMemoryContentFromInput(input: string): string | undefined {
  const normalizedInput = input.toLowerCase();
  const trigger = [
    "remember",
    "save this",
    "save that",
    "store this",
    "note that",
  ].find((candidate) => normalizedInput.includes(candidate));

  if (!trigger) {
    return undefined;
  }

  const triggerIndex = normalizedInput.indexOf(trigger);
  const memory = input
    .slice(triggerIndex + trigger.length)
    .replace(/^[\s:,-]+/, "")
    .trim();

  if (!memory || memory.length < 8) {
    return undefined;
  }

  return memory;
}

function getSearchTerms(input: string): Set<string> {
  return new Set(
    input
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 3),
  );
}

function scoreMemoryRelevance({
  memory,
  searchTerms,
}: {
  memory: MemoryFact;
  searchTerms: ReadonlySet<string>;
}): number {
  const memoryText = memory.content.toLowerCase();
  const exactMatchScore = [...searchTerms].filter((term) =>
    memoryText.includes(term),
  ).length;

  if (exactMatchScore > 0) {
    return exactMatchScore;
  }

  const broadTopicScore = ["sdk", "api", "project", "provider", "model"].filter(
    (term) => memoryText.includes(term) && searchTerms.has(term),
  ).length;

  return broadTopicScore * 0.5;
}

function getRelevantMemories({
  input,
  memories,
}: {
  input: string;
  memories: readonly MemoryFact[];
}): MemoryFact[] {
  const searchTerms = getSearchTerms(input);
  let usedChars = 0;

  return memories
    .map((memory) => ({
      memory,
      score: scoreMemoryRelevance({ memory, searchTerms }),
    }))
    .filter(({ score }) => score > 0)
    .sort((first, second) => {
      if (first.score !== second.score) {
        return second.score - first.score;
      }

      return second.memory.updatedAt.localeCompare(first.memory.updatedAt);
    })
    .flatMap(({ memory }): MemoryFact[] => {
      if (usedChars >= maxRelevantMemoryChars) {
        return [];
      }

      const remainingChars = maxRelevantMemoryChars - usedChars;
      const content = memory.content.slice(0, remainingChars).trim();

      if (!content) {
        return [];
      }

      usedChars += content.length;
      return [{ ...memory, content }];
    })
    .slice(0, maxRelevantMemoryCount);
}

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Could not read image."));
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

export function ModelTester() {
  const [conversationHistory, setConversationHistory] = useState<
    ConversationTurn[]
  >([]);
  const [conversationSummary, setConversationSummary] = useState("");
  const [conversationTitle, setConversationTitle] = useState("");
  const [hasHydrated, setHasHydrated] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [input, setInput] = useState("");
  const [memoryInput, setMemoryInput] = useState("");
  const [memories, setMemories] = useState<MemoryFact[]>([]);
  const [output, setOutput] = useState("");
  const [userContext, setUserContext] = useState("");
  const [userName, setUserName] = useState("");
  const [requestMode, setRequestMode] = useState<RequestMode>("idle");
  const [savedConversationId, setSavedConversationId] = useState("");
  const [savedConversations, setSavedConversations] = useState<
    SavedConversation[]
  >([]);

  const conversationUserKey = getConversationUserKey(userName);
  const historyLimit = getConversationHistoryCharLimit();
  const historySize = getConversationSize(
    conversationHistory,
    conversationSummary,
  );
  const isLoading = requestMode !== "idle";
  const isInputEmpty = input.trim().length === 0;
  const canSaveConversation =
    conversationHistory.length > 0 && Boolean(conversationUserKey);
  const isSendDisabled = hasHydrated && (isLoading || isInputEmpty);
  const relevantMemories = getRelevantMemories({ input, memories });
  const requestBody = {
    conversationHistory,
    conversationSummary: conversationSummary || undefined,
    imageUrl: imageUrl.trim() || undefined,
    input,
    memories: relevantMemories,
    userContext: userContext.trim() || undefined,
    userName: userName.trim() || undefined,
  };

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    setSavedConversations(readSavedConversations(userName));
    setMemories(readSavedMemories(userName));
    setMemoryInput("");
    setSavedConversationId("");
  }, [hasHydrated, userName]);

  function applyCompactedConversation(
    nextHistory: readonly ConversationTurn[],
    nextSummary = conversationSummary,
  ): void {
    const compactedConversation = compactConversationHistory({
      history: nextHistory,
      summary: nextSummary,
    });

    setConversationHistory(compactedConversation.history);
    setConversationSummary(compactedConversation.summary);
  }

  function saveCurrentConversation(): void {
    if (!canSaveConversation) {
      return;
    }

    const compactedConversation = compactConversationHistory({
      history: conversationHistory,
      summary: conversationSummary,
    });
    const now = new Date().toISOString();
    const fallbackTitle =
      compactedConversation.history
        .find((turn) => turn.role === "user")
        ?.content.slice(0, 48) || "SDK conversation";
    const title = conversationTitle.trim() || fallbackTitle;
    const savedConversation: SavedConversation = {
      history: compactedConversation.history,
      id: savedConversationId || crypto.randomUUID(),
      summary: compactedConversation.summary,
      title,
      updatedAt: now,
    };
    const nextConversations = [
      savedConversation,
      ...savedConversations.filter(
        (conversation) => conversation.id !== savedConversation.id,
      ),
    ];

    writeSavedConversations(userName, nextConversations);
    setConversationHistory(compactedConversation.history);
    setConversationSummary(compactedConversation.summary);
    setConversationTitle(title);
    setSavedConversationId(savedConversation.id);
    setSavedConversations(nextConversations);
  }

  function loadConversation(conversationId: string): void {
    const savedConversation = savedConversations.find(
      (conversation) => conversation.id === conversationId,
    );

    if (!savedConversation) {
      setSavedConversationId("");
      return;
    }

    setConversationHistory(savedConversation.history);
    setConversationSummary(savedConversation.summary);
    setConversationTitle(savedConversation.title);
    setOutput("");
    setSavedConversationId(savedConversation.id);
  }

  function startNewConversation(): void {
    setConversationHistory([]);
    setConversationSummary("");
    setConversationTitle("");
    setOutput("");
    setSavedConversationId("");
  }

  function clearSelectedConversationHistory(): void {
    if (!savedConversationId) {
      startNewConversation();
      return;
    }

    const selectedConversation = savedConversations.find(
      (conversation) => conversation.id === savedConversationId,
    );

    if (!selectedConversation) {
      startNewConversation();
      return;
    }

    const clearedConversation: SavedConversation = {
      ...selectedConversation,
      history: [],
      summary: "",
      updatedAt: new Date().toISOString(),
    };
    const nextConversations = savedConversations.map((conversation) =>
      conversation.id === clearedConversation.id
        ? clearedConversation
        : conversation,
    );

    writeSavedConversations(userName, nextConversations);
    setConversationHistory([]);
    setConversationSummary("");
    setOutput("");
    setSavedConversations(nextConversations);
  }

  function deleteSelectedConversation(): void {
    if (!savedConversationId) {
      return;
    }

    const nextConversations = savedConversations.filter(
      (conversation) => conversation.id !== savedConversationId,
    );

    writeSavedConversations(userName, nextConversations);
    startNewConversation();
    setSavedConversations(nextConversations);
  }

  function saveMemoryContent(content: string): void {
    if (!content || !conversationUserKey) {
      return;
    }

    const nextMemories = [
      { id: crypto.randomUUID(), content, updatedAt: new Date().toISOString() },
      ...memories.filter((memory) => memory.content !== content),
    ];

    writeSavedMemories(userName, nextMemories);
    setMemories(nextMemories);
  }

  function saveMemory(): void {
    const content = memoryInput.trim();

    saveMemoryContent(content);
    setMemoryInput("");
  }

  function updateMemory(memoryId: string, content: string): void {
    const nextMemories = memories.map((memory) =>
      memory.id === memoryId
        ? { ...memory, content, updatedAt: new Date().toISOString() }
        : memory,
    );

    writeSavedMemories(userName, nextMemories);
    setMemories(nextMemories);
  }

  function deleteMemory(memoryId: string): void {
    const nextMemories = memories.filter((memory) => memory.id !== memoryId);

    writeSavedMemories(userName, nextMemories);
    setMemories(nextMemories);
  }

  async function sendInput(): Promise<void> {
    if (isLoading || isInputEmpty) {
      return;
    }

    const userMessage = input;
    setRequestMode("standard");
    setOutput("");

    try {
      const response = await fetch("/api/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...requestBody, stream: false }),
      });
      const data = (await response.json()) as ModelResponse;

      if (!response.ok) {
        setOutput(
          typeof data.error === "string" ? data.error : "Request failed.",
        );
        return;
      }

      const toolSummary = Array.isArray(data.toolResults)
        ? data.toolResults
            .map((toolResult) => {
              if (!toolResult || typeof toolResult !== "object") {
                return undefined;
              }

              const name = "name" in toolResult ? toolResult.name : undefined;
              const output =
                "output" in toolResult ? toolResult.output : undefined;

              if (typeof name !== "string" || typeof output !== "string") {
                return undefined;
              }

              return `Tool ${name} returned ${output}`;
            })
            .filter(Boolean)
            .join("\n")
        : "";
      const assistantMessage =
        typeof data.output === "string" ? data.output : "No text returned.";
      const nextHistory: ConversationTurn[] = [
        ...conversationHistory,
        { id: crypto.randomUUID(), role: "user", content: userMessage },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: assistantMessage,
        },
      ];

      setOutput(
        toolSummary
          ? `${assistantMessage}\n\n${toolSummary}`
          : assistantMessage,
      );
      applyCompactedConversation(nextHistory);

      const memoryContent = getMemoryContentFromInput(userMessage);
      if (memoryContent) {
        saveMemoryContent(memoryContent);
      }

      setInput("");
    } catch {
      setOutput("Request failed.");
    } finally {
      setRequestMode("idle");
    }
  }

  async function streamInput(): Promise<void> {
    if (isLoading || isInputEmpty) {
      return;
    }

    const userMessage = input;
    let assistantMessage = "";
    setRequestMode("streaming");
    setOutput("");

    try {
      const response = await fetch("/api/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...requestBody, stream: true }),
      });

      if (!response.ok) {
        const data = (await response.json()) as ModelResponse;
        setOutput(
          typeof data.error === "string" ? data.error : "Request failed.",
        );
        return;
      }

      if (!response.body) {
        setOutput("No response stream returned.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        const chunk = decoder.decode(value);
        assistantMessage += chunk;
        setOutput((currentOutput) => currentOutput + chunk);
      }

      const nextHistory: ConversationTurn[] = [
        ...conversationHistory,
        { id: crypto.randomUUID(), role: "user", content: userMessage },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: assistantMessage,
        },
      ];

      applyCompactedConversation(nextHistory);
      setInput("");
    } catch {
      setOutput("Request failed.");
    } finally {
      setRequestMode("idle");
    }
  }

  function sendOnEnter(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void sendInput();
  }

  async function updateImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      setImageUrl("");
      return;
    }

    setImageUrl(await readImageAsDataUrl(file));
  }

  return (
    <section className="mt-10 w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Student name
          <input
            type="text"
            value={userName}
            onChange={(event) => setUserName(event.target.value)}
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent p-3 text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:text-zinc-50 dark:focus:border-zinc-50"
            placeholder="Optional"
          />
        </label>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Learning context
          <input
            type="text"
            value={userContext}
            onChange={(event) => setUserContext(event.target.value)}
            className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent p-3 text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:text-zinc-50 dark:focus:border-zinc-50"
            placeholder="Optional"
          />
        </label>
      </div>
      <div className="mt-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Long-term memory
          <textarea
            value={memoryInput}
            onChange={(event) => setMemoryInput(event.target.value)}
            className="mt-2 min-h-20 w-full rounded-xl border border-zinc-300 bg-transparent p-3 text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:text-zinc-50 dark:focus:border-zinc-50"
            placeholder="Save an important user or project fact..."
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={saveMemory}
            disabled={!conversationUserKey || memoryInput.trim().length === 0}
            className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            Save memory
          </button>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Memories are stored in this browser, separated by student name, and
            reused in new conversations.
          </p>
        </div>
        {memories.length > 0 ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              What the assistant remembers
            </p>
            {memories.map((memory) => (
              <div
                key={memory.id}
                className="rounded-lg bg-zinc-100 p-3 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                <textarea
                  value={memory.content}
                  onChange={(event) =>
                    updateMemory(memory.id, event.target.value)
                  }
                  className="min-h-16 w-full rounded-lg border border-zinc-300 bg-white p-2 text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50"
                  aria-label="Edit saved memory"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-500 dark:text-zinc-500">
                    Updated {new Date(memory.updatedAt).toLocaleString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteMemory(memory.id)}
                    className="shrink-0 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    Delete memory
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <label
        htmlFor="model-input"
        className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        Text to send
        <span className="ml-2 text-xs font-normal text-zinc-500">
          Enter sends, Shift+Enter adds a new line.
        </span>
      </label>
      <textarea
        id="model-input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={sendOnEnter}
        className="mt-2 min-h-32 w-full rounded-xl border border-zinc-300 bg-transparent p-3 text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:text-zinc-50 dark:focus:border-zinc-50"
        placeholder="Type a message..."
      />
      <label
        htmlFor="model-image"
        className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        Optional image
      </label>
      <input
        id="model-image"
        type="file"
        accept="image/*"
        onChange={updateImage}
        className="mt-2 block w-full text-sm text-zinc-700 file:mr-4 file:rounded-full file:border-0 file:bg-zinc-950 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white dark:text-zinc-300 dark:file:bg-zinc-50 dark:file:text-zinc-950"
      />
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt="Selected preview"
          width={640}
          height={360}
          unoptimized
          className="mt-4 max-h-64 rounded-xl border border-zinc-200 object-contain dark:border-zinc-800"
        />
      ) : null}
      <div className="mt-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Conversation title
            <input
              type="text"
              value={conversationTitle}
              onChange={(event) => setConversationTitle(event.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent p-3 text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:text-zinc-50 dark:focus:border-zinc-50"
              placeholder="Optional title for saving"
            />
          </label>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Load saved conversation
            <select
              value={savedConversationId}
              onChange={(event) => loadConversation(event.target.value)}
              disabled={!conversationUserKey || savedConversations.length === 0}
              className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent p-3 text-zinc-950 outline-none focus:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:focus:border-zinc-50"
            >
              <option value="">
                {conversationUserKey
                  ? "Choose saved conversation"
                  : "Enter student name first"}
              </option>
              {savedConversations.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>
                  {conversation.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={clearSelectedConversationHistory}
            disabled={
              isLoading ||
              (!savedConversationId &&
                conversationHistory.length === 0 &&
                !conversationSummary)
            }
            className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            Clear conversation history
          </button>
          <button
            type="button"
            onClick={deleteSelectedConversation}
            disabled={isLoading || !savedConversationId}
            className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            Delete saved conversation
          </button>
        </div>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Saved in this browser and separated by student name. History compacts
          at {historyLimit.toLocaleString()} characters; current size is about{" "}
          {historySize.toLocaleString()} characters.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={sendInput}
          disabled={isSendDisabled}
          className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
        >
          {requestMode === "standard" ? "Sending..." : "Send"}
        </button>
        <button
          type="button"
          onClick={streamInput}
          disabled={isSendDisabled}
          className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
        >
          {requestMode === "streaming" ? "Streaming..." : "Stream"}
        </button>
        <button
          type="button"
          onClick={saveCurrentConversation}
          disabled={isLoading || !canSaveConversation}
          className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
        >
          Save conversation
        </button>
        <button
          type="button"
          onClick={startNewConversation}
          disabled={isLoading || conversationHistory.length === 0}
          className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
        >
          New conversation
        </button>
      </div>
      {conversationSummary ? (
        <div className="mt-6 rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <p className="font-medium text-zinc-700 dark:text-zinc-300">
            Older context summary
          </p>
          <p className="mt-2 whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
            {conversationSummary}
          </p>
        </div>
      ) : null}
      {conversationHistory.length > 0 ? (
        <div className="mt-6 space-y-3 rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <p className="font-medium text-zinc-700 dark:text-zinc-300">
            Recent conversation
          </p>
          {conversationHistory.slice(-6).map((turn) => (
            <div key={turn.id} className="text-zinc-600 dark:text-zinc-400">
              <span className="font-medium capitalize text-zinc-900 dark:text-zinc-100">
                {turn.role}:
              </span>{" "}
              {turn.content}
            </div>
          ))}
        </div>
      ) : null}
      {output ? (
        <div className="mt-6 whitespace-pre-wrap rounded-xl bg-zinc-100 p-4 text-sm leading-6 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
          {output}
        </div>
      ) : null}
    </section>
  );
}
