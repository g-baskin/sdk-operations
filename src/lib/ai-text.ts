import type { ResponseInputItem } from "openai/resources/responses/responses";
import { shouldFallbackAIRequest, toAIRequestError } from "./ai-errors";
import { withAIRetry } from "./ai-retry";
import {
  type AIModelTier,
  type AIProviderTarget,
  getAIClient,
  getAIModel,
  hasBackupAIProvider,
} from "./openai-client";

type TextRequest = {
  imageUrl?: string | undefined;
  input: string;
  modelTier?: AIModelTier;
};

const complexRequestPattern =
  /\b(analy[sz]e|architecture|compare|complex|debug|design|diagnose|explain|image|plan|reason|refactor|review|strategy|vision)\b/i;

function resolveModelTier({
  imageUrl,
  input,
  modelTier,
}: TextRequest): Exclude<AIModelTier, "auto"> {
  if (modelTier === "fast" || modelTier === "flagship") {
    return modelTier;
  }

  if (imageUrl || input.length > 1000 || complexRequestPattern.test(input)) {
    return "flagship";
  }

  return "fast";
}

function buildModelInput({
  imageUrl,
  input,
}: TextRequest): string | ResponseInputItem[] {
  if (!imageUrl) {
    return input;
  }

  return [
    {
      role: "user",
      content: [
        { type: "input_text", text: input },
        { type: "input_image", image_url: imageUrl, detail: "auto" },
      ],
    },
  ];
}

async function withAIProviderFallback<T>(
  operation: (target: AIProviderTarget) => Promise<T>,
): Promise<T> {
  try {
    return await withAIRetry(() => operation("primary"));
  } catch (error) {
    if (!hasBackupAIProvider() || !shouldFallbackAIRequest(error)) {
      throw error;
    }

    return await withAIRetry(() => operation("backup"));
  }
}

export async function generateText(request: TextRequest): Promise<string> {
  const modelTier = resolveModelTier(request);
  const modelInput = buildModelInput(request);
  const response = await withAIProviderFallback((target) =>
    getAIClient(target).responses.create({
      model: getAIModel(modelTier, target),
      input: modelInput,
    }),
  );

  return response.output_text;
}

export async function streamText(
  request: TextRequest,
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();
  const modelTier = resolveModelTier(request);
  const modelInput = buildModelInput(request);
  const stream = await withAIProviderFallback((target) =>
    getAIClient(target).responses.create({
      model: getAIModel(modelTier, target),
      input: modelInput,
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
