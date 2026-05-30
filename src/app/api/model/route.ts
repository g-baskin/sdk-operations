import { AIRequestError, toAIRequestError } from "@/lib/ai-errors";
import { generateText, streamText } from "@/lib/ai-text";
import type { AIModelTier } from "@/lib/openai-client";

type ModelRequest = {
  imageUrl?: unknown;
  input?: unknown;
  modelTier?: unknown;
  stream?: unknown;
};

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

    const imageUrl = body.imageUrl?.trim() || undefined;
    const modelTier: AIModelTier =
      body.modelTier === "fast" || body.modelTier === "flagship"
        ? body.modelTier
        : "auto";

    if (body.stream === true) {
      return new Response(
        await streamText({ imageUrl, input: body.input, modelTier }),
        {
          headers: {
            "Cache-Control": "no-cache",
            "Content-Type": "text/plain; charset=utf-8",
          },
        },
      );
    }

    const output = await generateText({
      imageUrl,
      input: body.input,
      modelTier,
    });
    return Response.json({ output });
  } catch (error) {
    const requestError =
      error instanceof AIRequestError ? error : toAIRequestError(error);

    return Response.json(
      { error: requestError.message },
      { status: requestError.statusCode },
    );
  }
}
