import { deleteMemory, listMemories, saveMemory } from "@/lib/database";

type MemoryRequest = {
  content?: unknown;
  memoryId?: unknown;
  userName?: unknown;
};

function parseUserName(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const userName = parseUserName(searchParams.get("userName"));

    if (!userName) {
      return Response.json({ memories: [] });
    }

    return Response.json({ memories: listMemories(userName) });
  } catch {
    return Response.json(
      { error: "Could not load memories." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as MemoryRequest;
    const userName = parseUserName(body.userName);
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const memoryId =
      typeof body.memoryId === "string" && body.memoryId
        ? body.memoryId
        : undefined;

    if (!userName || !content) {
      return Response.json(
        { error: "User name and memory content are required." },
        { status: 400 },
      );
    }

    return Response.json({ id: saveMemory({ content, memoryId, userName }) });
  } catch {
    return Response.json({ error: "Could not save memory." }, { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const userName = parseUserName(searchParams.get("userName"));
    const memoryId = searchParams.get("memoryId");

    if (!userName || !memoryId) {
      return Response.json(
        { error: "User name and memory ID are required." },
        { status: 400 },
      );
    }

    deleteMemory({ memoryId, userName });
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Could not delete memory." },
      { status: 500 },
    );
  }
}
