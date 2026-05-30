import {
  clearConversationHistory,
  type DatabaseConversationTurn,
  deleteConversation,
  getConversation,
  listConversations,
  saveConversation,
} from "@/lib/database";

type ConversationRequest = {
  conversationId?: unknown;
  history?: unknown;
  summary?: unknown;
  title?: unknown;
  userName?: unknown;
};

function parseUserName(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseHistory(value: unknown): DatabaseConversationTurn[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((turn): DatabaseConversationTurn[] => {
    if (!turn || typeof turn !== "object") {
      return [];
    }

    const id = "id" in turn ? turn.id : undefined;
    const role = "role" in turn ? turn.role : undefined;
    const content = "content" in turn ? turn.content : undefined;

    if (
      typeof id !== "string" ||
      (role !== "assistant" && role !== "system" && role !== "user") ||
      typeof content !== "string"
    ) {
      return [];
    }

    return [{ content, id, role }];
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const userName = parseUserName(searchParams.get("userName"));

    if (!userName) {
      return Response.json({ conversations: [] });
    }

    const conversationId = searchParams.get("conversationId");

    if (conversationId) {
      return Response.json({
        conversation: getConversation({ conversationId, userName }),
      });
    }

    return Response.json({
      conversations: listConversations(userName).map((conversation) => ({
        ...conversation,
        history:
          getConversation({ conversationId: conversation.id, userName })
            ?.history ?? [],
      })),
    });
  } catch {
    return Response.json(
      { error: "Could not load conversations." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as ConversationRequest;
    const userName = parseUserName(body.userName);

    if (!userName) {
      return Response.json(
        { error: "User name is required." },
        { status: 400 },
      );
    }

    const history = parseHistory(body.history);
    const summary = typeof body.summary === "string" ? body.summary : "";
    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : "SDK conversation";
    const conversationId =
      typeof body.conversationId === "string" && body.conversationId
        ? body.conversationId
        : undefined;
    const id = saveConversation({
      conversationId,
      history,
      summary,
      title,
      userName,
    });

    return Response.json({ id });
  } catch {
    return Response.json(
      { error: "Could not save conversation." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as ConversationRequest;
    const userName = parseUserName(body.userName);
    const conversationId =
      typeof body.conversationId === "string" ? body.conversationId : undefined;

    if (!userName || !conversationId) {
      return Response.json(
        { error: "User name and conversation ID are required." },
        { status: 400 },
      );
    }

    clearConversationHistory({ conversationId, userName });
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Could not clear conversation history." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const userName = parseUserName(searchParams.get("userName"));
    const conversationId = searchParams.get("conversationId");

    if (!userName || !conversationId) {
      return Response.json(
        { error: "User name and conversation ID are required." },
        { status: 400 },
      );
    }

    deleteConversation({ conversationId, userName });
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Could not delete conversation." },
      { status: 500 },
    );
  }
}
