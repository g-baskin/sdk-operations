import { AIRequestError, toAIRequestError } from "@/lib/ai-errors";
import {
  type ConversationTurn,
  generateText,
  type MemoryFact,
  streamText,
} from "@/lib/ai-text";
import type { AIModelTier } from "@/lib/openai-client";

type ModelRequest = {
  conversationHistory?: unknown;
  conversationSummary?: unknown;
  imageUrl?: unknown;
  input?: unknown;
  memories?: unknown;
  modelTier?: unknown;
  stream?: unknown;
  userContext?: unknown;
  userName?: unknown;
};

const maxMemoryContextChars = 2500;
const maxMemoryContextCount = 8;

function parseConversationHistory(value: unknown): ConversationTurn[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((turn): ConversationTurn[] => {
    if (!turn || typeof turn !== "object") {
      return [];
    }

    const role = "role" in turn ? turn.role : undefined;
    const content = "content" in turn ? turn.content : undefined;

    if (
      (role !== "assistant" && role !== "user") ||
      typeof content !== "string" ||
      content.trim().length === 0
    ) {
      return [];
    }

    return [{ role, content }];
  });
}

function parseMemories(value: unknown): MemoryFact[] {
  if (!Array.isArray(value)) {
    return [];
  }

  let usedChars = 0;

  return value
    .flatMap((memory): MemoryFact[] => {
      if (usedChars >= maxMemoryContextChars) {
        return [];
      }

      if (!memory || typeof memory !== "object") {
        return [];
      }

      const content = "content" in memory ? memory.content : undefined;

      if (typeof content !== "string" || content.trim().length === 0) {
        return [];
      }

      const remainingChars = maxMemoryContextChars - usedChars;
      const trimmedContent = content.trim().slice(0, remainingChars).trim();

      if (!trimmedContent) {
        return [];
      }

      usedChars += trimmedContent.length;
      return [{ content: trimmedContent }];
    })
    .slice(0, maxMemoryContextCount);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as ModelRequest;

    if (typeof body.input !== "string" || body.input.trim().length === 0) {
      return Response.json(
        { error: "Input text is required." },
        { status: 400 },
      );
    }

    if (body.imageUrl !== undefined && typeof body.imageUrl !== "string") {
      return Response.json(
        { error: "Image must be a URL or data URL string." },
        { status: 400 },
      );
    }

    if (body.userName !== undefined && typeof body.userName !== "string") {
      return Response.json(
        { error: "User name must be a string." },
        { status: 400 },
      );
    }

    if (
      body.userContext !== undefined &&
      typeof body.userContext !== "string"
    ) {
      return Response.json(
        { error: "User context must be a string." },
        { status: 400 },
      );
    }

    if (
      body.conversationHistory !== undefined &&
      !Array.isArray(body.conversationHistory)
    ) {
      return Response.json(
        { error: "Conversation history must be an array." },
        { status: 400 },
      );
    }

    if (
      body.conversationSummary !== undefined &&
      typeof body.conversationSummary !== "string"
    ) {
      return Response.json(
        { error: "Conversation summary must be a string." },
        { status: 400 },
      );
    }

    if (body.memories !== undefined && !Array.isArray(body.memories)) {
      return Response.json(
        { error: "Memories must be an array." },
        { status: 400 },
      );
    }

    const conversationHistory = parseConversationHistory(
      body.conversationHistory,
    );
    const conversationSummary = body.conversationSummary?.trim() || undefined;
    const memories = parseMemories(body.memories);
    const imageUrl = body.imageUrl?.trim() || undefined;
    const userContext = body.userContext?.trim() || undefined;
    const userName = body.userName?.trim() || undefined;
    const modelTier: AIModelTier =
      body.modelTier === "fast" || body.modelTier === "flagship"
        ? body.modelTier
        : "auto";

    if (body.stream === true) {
      return new Response(
        await streamText({
          conversationHistory,
          conversationSummary,
          imageUrl,
          input: body.input,
          memories,
          modelTier,
          userContext,
          userName,
        }),
        {
          headers: {
            "Cache-Control": "no-cache",
            "Content-Type": "text/plain; charset=utf-8",
          },
        },
      );
    }

    const result = await generateText({
      conversationHistory,
      conversationSummary,
      imageUrl,
      input: body.input,
      memories,
      modelTier,
      userContext,
      userName,
    });
    return Response.json(result);
  } catch (error) {
    const requestError =
      error instanceof AIRequestError ? error : toAIRequestError(error);

    return Response.json(
      { error: requestError.message },
      { status: requestError.statusCode },
    );
  }
}
