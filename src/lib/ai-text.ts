import type {
  ResponseFunctionToolCall,
  ResponseInputItem,
} from "openai/resources/responses/responses";
import { shouldFallbackAIRequest } from "./ai-errors";
import { withAIRetry } from "./ai-retry";
import { buildAISystemPrompt } from "./ai-system-prompt";
import { aiTools, buildToolResultInput, type ToolCallResult } from "./ai-tools";
import {
  type AIModelTier,
  type AIProviderTarget,
  getAIClient,
  getAIModel,
  hasBackupAIProvider,
} from "./openai-client";

export type ConversationTurn = {
  content: string;
  role: "assistant" | "user";
};

export type MemoryFact = {
  content: string;
};

type TextRequest = {
  conversationHistory?: readonly ConversationTurn[] | undefined;
  conversationSummary?: string | undefined;
  imageUrl?: string | undefined;
  input: string;
  memories?: readonly MemoryFact[] | undefined;
  modelTier?: AIModelTier;
  userContext?: string | undefined;
  userName?: string | undefined;
};

export type TextResponse = {
  output: string;
  toolResults: ToolCallResult[];
};

const maxMemoryContextChars = 2500;
const maxMemoryContextCount = 8;
export const maxToolCallIterations = 4;
const recentHistoryLimit = 8;
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

function buildConversationText({
  conversationHistory,
  conversationSummary,
  input,
  memories,
}: TextRequest): string {
  const recentTurns = (conversationHistory ?? [])
    .filter((turn) => turn.content.trim().length > 0)
    .slice(-recentHistoryLimit);
  const contextSections: string[] = [];

  let usedMemoryChars = 0;
  const relevantMemories = (memories ?? [])
    .flatMap((memory): MemoryFact[] => {
      if (usedMemoryChars >= maxMemoryContextChars) {
        return [];
      }

      const remainingChars = maxMemoryContextChars - usedMemoryChars;
      const content = memory.content.trim().slice(0, remainingChars).trim();

      if (!content) {
        return [];
      }

      usedMemoryChars += content.length;
      return [{ content }];
    })
    .slice(0, maxMemoryContextCount);

  if (relevantMemories.length > 0) {
    contextSections.push(
      `Long-term memory for this student/project:\n${relevantMemories
        .map((memory) => `- ${memory.content.trim()}`)
        .join("\n")}`,
    );
  }

  if (conversationSummary?.trim()) {
    contextSections.push(
      `Older conversation summary:\n${conversationSummary.trim()}`,
    );
  }

  if (recentTurns.length > 0) {
    const historyText = recentTurns
      .map(
        (turn) =>
          `${turn.role === "user" ? "Student" : "Assistant"}: ${turn.content}`,
      )
      .join("\n");

    contextSections.push(
      `Recent conversation in this session:\n${historyText}`,
    );
  }

  if (contextSections.length === 0) {
    return input;
  }

  return `${contextSections.join("\n\n")}\n\nCurrent student message:\n${input}`;
}

function buildModelInput(request: TextRequest): string | ResponseInputItem[] {
  const textInput = buildConversationText(request);

  if (!request.imageUrl) {
    return textInput;
  }

  return [
    {
      role: "user",
      content: [
        { type: "input_text", text: textInput },
        { type: "input_image", image_url: request.imageUrl, detail: "auto" },
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

function getFunctionToolCalls(
  responseOutput: readonly unknown[],
): ResponseFunctionToolCall[] {
  return responseOutput.filter((item): item is ResponseFunctionToolCall => {
    if (!item || typeof item !== "object") {
      return false;
    }

    return (
      "type" in item &&
      item.type === "function_call" &&
      "call_id" in item &&
      typeof item.call_id === "string" &&
      "name" in item &&
      typeof item.name === "string" &&
      "arguments" in item &&
      typeof item.arguments === "string"
    );
  });
}

function toResponseInputItems(
  modelInput: string | ResponseInputItem[],
): ResponseInputItem[] {
  if (Array.isArray(modelInput)) {
    return modelInput;
  }

  return [{ role: "user", content: modelInput } satisfies ResponseInputItem];
}

export async function generateText(
  request: TextRequest,
): Promise<TextResponse> {
  const modelTier = resolveModelTier(request);
  const modelInput = buildModelInput(request);
  const systemPrompt = buildAISystemPrompt({
    currentDate: new Date().toISOString().slice(0, 10),
    userContext: request.userContext,
    userName: request.userName,
  });
  const toolResults: ToolCallResult[] = [];
  let currentInput = toResponseInputItems(modelInput);

  for (let iteration = 0; iteration < maxToolCallIterations; iteration += 1) {
    const response = await withAIProviderFallback((target) =>
      getAIClient(target).responses.create({
        model: getAIModel(modelTier, target),
        instructions: systemPrompt,
        input: currentInput,
        tools: aiTools,
        stream: false,
      }),
    );
    const toolCalls = getFunctionToolCalls(response.output);

    if (toolCalls.length === 0) {
      return { output: response.output_text, toolResults };
    }

    const toolResultInput = buildToolResultInput(toolCalls);
    toolResults.push(...toolResultInput.results);
    currentInput = [...currentInput, ...toolCalls, ...toolResultInput.input];
  }

  const finalResponse = await withAIProviderFallback((target) =>
    getAIClient(target).responses.create({
      model: getAIModel(modelTier, target),
      instructions: systemPrompt,
      input: currentInput,
      tool_choice: "none",
      tools: aiTools,
      stream: false,
    }),
  );

  return { output: finalResponse.output_text, toolResults };
}

export async function streamText(
  request: TextRequest,
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const response = await generateText(request);
      controller.enqueue(encoder.encode(response.output));
      controller.close();
    },
  });
}
