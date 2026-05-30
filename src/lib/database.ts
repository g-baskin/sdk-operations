import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";

export type DatabaseConversation = {
  id: string;
  summary: string;
  title: string;
  updatedAt: string;
};

export type DatabaseConversationTurn = {
  content: string;
  id: string;
  role: "assistant" | "system" | "user";
};

export type DatabaseMemory = {
  content: string;
  id: string;
  updatedAt: string;
};

export type DatabaseToolCallLog = {
  callId: string;
  detail: string;
  id: string;
  name: string;
  outcome: string;
  policyJson: string;
  timestamp: string;
};

type ConversationRow = {
  id: string;
  summary: string;
  title: string;
  updated_at: string;
};

type ConversationTurnRow = {
  content: string;
  id: string;
  role: "assistant" | "system" | "user";
};

type MemoryRow = {
  content: string;
  id: string;
  updated_at: string;
};

type ToolCallLogRow = {
  call_id: string;
  detail: string;
  id: string;
  name: string;
  outcome: string;
  policy_json: string;
  timestamp: string;
};

const databasePath =
  process.env.SDK_OPERATIONS_DATABASE_PATH ??
  join(process.cwd(), "data", "sdk-operations.sqlite");

declare global {
  var sdkOperationsDatabase: Database.Database | undefined;
}

function getNow(): string {
  return new Date().toISOString();
}

function getUserKey(userName: string): string | undefined {
  const normalizedName = userName.trim().toLowerCase();

  if (normalizedName.length === 0) {
    return undefined;
  }

  return normalizedName.replace(/[^a-z0-9_-]+/g, "-");
}

function openDatabase(): Database.Database {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  return database;
}

export function getDatabase(): Database.Database {
  globalThis.sdkOperationsDatabase ??= openDatabase();
  return globalThis.sdkOperationsDatabase;
}

export function initializeDatabase(): void {
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversation_turns (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
      content TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS conversation_turns_conversation_position_idx
      ON conversation_turns(conversation_id, position);

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS memories_user_updated_idx
      ON memories(user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS tool_call_logs (
      id TEXT PRIMARY KEY,
      call_id TEXT NOT NULL,
      name TEXT NOT NULL,
      outcome TEXT NOT NULL,
      detail TEXT NOT NULL,
      policy_json TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS tool_call_logs_timestamp_idx
      ON tool_call_logs(timestamp DESC);
  `);
}

export function ensureUser(userName: string): string | undefined {
  const userId = getUserKey(userName);

  if (!userId) {
    return undefined;
  }

  initializeDatabase();
  const now = getNow();
  getDatabase()
    .prepare(
      `INSERT INTO users (id, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at`,
    )
    .run(userId, userName.trim(), now, now);

  return userId;
}

export function listConversations(userName: string): DatabaseConversation[] {
  const userId = ensureUser(userName);

  if (!userId) {
    return [];
  }

  return getDatabase()
    .prepare<[string], ConversationRow>(
      `SELECT id, title, summary, updated_at
       FROM conversations
       WHERE user_id = ?
       ORDER BY updated_at DESC`,
    )
    .all(userId)
    .map((conversation) => ({
      id: conversation.id,
      summary: conversation.summary,
      title: conversation.title,
      updatedAt: conversation.updated_at,
    }));
}

export function getConversation({
  conversationId,
  userName,
}: {
  conversationId: string;
  userName: string;
}):
  | (DatabaseConversation & { history: DatabaseConversationTurn[] })
  | undefined {
  const userId = ensureUser(userName);

  if (!userId) {
    return undefined;
  }

  const row = getDatabase()
    .prepare<[string, string], ConversationRow>(
      `SELECT id, title, summary, updated_at
       FROM conversations
       WHERE id = ? AND user_id = ?`,
    )
    .get(conversationId, userId);

  if (!row) {
    return undefined;
  }

  const history = getDatabase()
    .prepare<[string], ConversationTurnRow>(
      `SELECT id, role, content
       FROM conversation_turns
       WHERE conversation_id = ?
       ORDER BY position ASC`,
    )
    .all(conversationId)
    .map((turn) => ({ content: turn.content, id: turn.id, role: turn.role }));

  return {
    history,
    id: row.id,
    summary: row.summary,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

export function saveConversation({
  conversationId,
  history,
  summary,
  title,
  userName,
}: {
  conversationId?: string | undefined;
  history: readonly DatabaseConversationTurn[];
  summary: string;
  title: string;
  userName: string;
}): string | undefined {
  const userId = ensureUser(userName);

  if (!userId) {
    return undefined;
  }

  const database = getDatabase();
  const now = getNow();
  const id = conversationId || crypto.randomUUID();

  database.exec("BEGIN");

  try {
    database
      .prepare(
        `INSERT INTO conversations (id, user_id, title, summary, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, summary = excluded.summary, updated_at = excluded.updated_at`,
      )
      .run(id, userId, title, summary, now, now);
    database
      .prepare("DELETE FROM conversation_turns WHERE conversation_id = ?")
      .run(id);

    const insertTurn = database.prepare(
      `INSERT INTO conversation_turns (id, conversation_id, role, content, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );

    history.forEach((turn, index) => {
      insertTurn.run(turn.id, id, turn.role, turn.content, index, now);
    });
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return id;
}

export function clearConversationHistory({
  conversationId,
  userName,
}: {
  conversationId: string;
  userName: string;
}): void {
  const userId = ensureUser(userName);

  if (!userId) {
    return;
  }

  const database = getDatabase();
  const now = getNow();

  database.exec("BEGIN");

  try {
    database
      .prepare("DELETE FROM conversation_turns WHERE conversation_id = ?")
      .run(conversationId);
    database
      .prepare(
        "UPDATE conversations SET summary = '', updated_at = ? WHERE id = ? AND user_id = ?",
      )
      .run(now, conversationId, userId);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function deleteConversation({
  conversationId,
  userName,
}: {
  conversationId: string;
  userName: string;
}): void {
  const userId = ensureUser(userName);

  if (!userId) {
    return;
  }

  getDatabase()
    .prepare("DELETE FROM conversations WHERE id = ? AND user_id = ?")
    .run(conversationId, userId);
}

export function listMemories(userName: string): DatabaseMemory[] {
  const userId = ensureUser(userName);

  if (!userId) {
    return [];
  }

  return getDatabase()
    .prepare<[string], MemoryRow>(
      `SELECT id, content, updated_at
       FROM memories
       WHERE user_id = ?
       ORDER BY updated_at DESC`,
    )
    .all(userId)
    .map((memory) => ({
      content: memory.content,
      id: memory.id,
      updatedAt: memory.updated_at,
    }));
}

export function saveMemory({
  content,
  memoryId,
  userName,
}: {
  content: string;
  memoryId?: string | undefined;
  userName: string;
}): string | undefined {
  const userId = ensureUser(userName);

  if (!userId) {
    return undefined;
  }

  const now = getNow();
  const id = memoryId || crypto.randomUUID();
  getDatabase()
    .prepare(
      `INSERT INTO memories (id, user_id, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
    )
    .run(id, userId, content, now, now);

  return id;
}

export function deleteMemory({
  memoryId,
  userName,
}: {
  memoryId: string;
  userName: string;
}): void {
  const userId = ensureUser(userName);

  if (!userId) {
    return;
  }

  getDatabase()
    .prepare("DELETE FROM memories WHERE id = ? AND user_id = ?")
    .run(memoryId, userId);
}

export function logToolCallToDatabase({
  callId,
  detail,
  name,
  outcome,
  policyJson,
  timestamp,
}: Omit<DatabaseToolCallLog, "id">): void {
  initializeDatabase();
  getDatabase()
    .prepare(
      `INSERT INTO tool_call_logs (id, call_id, name, outcome, detail, policy_json, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      crypto.randomUUID(),
      callId,
      name,
      outcome,
      detail,
      policyJson,
      timestamp,
    );
}

export function listToolCallLogs(): DatabaseToolCallLog[] {
  initializeDatabase();
  return getDatabase()
    .prepare<[], ToolCallLogRow>(
      `SELECT id, call_id, name, outcome, detail, policy_json, timestamp
       FROM tool_call_logs
       ORDER BY timestamp DESC
       LIMIT 100`,
    )
    .all()
    .map((log) => ({
      callId: log.call_id,
      detail: log.detail,
      id: log.id,
      name: log.name,
      outcome: log.outcome,
      policyJson: log.policy_json,
      timestamp: log.timestamp,
    }));
}
