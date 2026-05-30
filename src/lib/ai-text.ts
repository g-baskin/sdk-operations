import { toAIRequestError } from "./ai-errors";
import { withAIRetry } from "./ai-retry";
import { getAIClient, getAIProviderConfig } from "./openai-client";

type TextRequest = {
  input: string;
};

export async function generateText({ input }: TextRequest): Promise<string> {
  const response = await withAIRetry(() =>
    getAIClient().responses.create({
      model: getAIProviderConfig().model,
      input,
    }),
  );

  return response.output_text;
}

export async function streamText({
  input,
}: TextRequest): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();
  const stream = await withAIRetry(() =>
    getAIClient().responses.create({
      model: getAIProviderConfig().model,
      input,
      stream: true,
    }),
  );

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "response.output_text.delta") {
            controller.enqueue(encoder.encode(event.delta));
          }

          if (event.type === "error") {
            throw new Error(event.message);
          }

          if (event.type === "response.failed") {
            throw new Error("AI provider response failed while streaming.");
          }
        }
      } catch (error) {
        controller.enqueue(
          encoder.encode(`\n\nError: ${toAIRequestError(error).message}`),
        );
        controller.close();
        return;
      }

      controller.close();
    },
  });
}
