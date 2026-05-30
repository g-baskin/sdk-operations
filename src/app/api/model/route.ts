import { AIRequestError, toAIRequestError } from "@/lib/ai-errors";
import { generateText, streamText } from "@/lib/ai-text";

type ModelRequest = {
  input?: unknown;
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

    if (body.stream === true) {
      return new Response(await streamText({ input: body.input }), {
        headers: {
          "Cache-Control": "no-cache",
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    const output = await generateText({ input: body.input });
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
