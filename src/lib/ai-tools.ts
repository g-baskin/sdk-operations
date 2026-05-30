import type {
  FunctionTool,
  ResponseFunctionToolCall,
  ResponseInputItem,
} from "openai/resources/responses/responses";
import { logToolCallToDatabase } from "./database";

export type ToolCallResult = {
  name: string;
  output: string;
};

type ToolRiskLevel = "read_only" | "requires_confirmation" | "destructive";

type ToolPolicy = {
  allowedEffects: string[];
  requiresConfirmation: boolean;
  riskLevel: ToolRiskLevel;
};

type AIToolDefinition<Arguments> = {
  definition: FunctionTool;
  policy: ToolPolicy;
  run: (arguments_: Arguments) => string;
  validate: (rawArguments: string) => Arguments;
};

type RunnableAITool = {
  definition: FunctionTool;
  policy: ToolPolicy;
  runRaw: (rawArguments: string) => string;
};

type CountTextCharactersArguments = {
  text: string;
};

type NormalizeSdkNameArguments = {
  sdkName: string;
};

function defineAITool<Arguments>({
  definition,
  policy,
  run,
  validate,
}: AIToolDefinition<Arguments>): RunnableAITool {
  return {
    definition,
    policy,
    runRaw(rawArguments: string): string {
      return run(validate(rawArguments));
    },
  };
}

function buildToolErrorOutput(message: string): string {
  return JSON.stringify({ error: message, ok: false });
}

function logToolCall({
  callId,
  detail,
  name,
  outcome,
  policy,
}: {
  callId: string;
  detail: string;
  name: string;
  outcome: "blocked" | "executed" | "unknown" | "validation_error";
  policy?: ToolPolicy | undefined;
}): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    callId,
    detail,
    name,
    outcome,
    policy,
    timestamp,
    type: "ai_tool_call",
  };

  console.info(JSON.stringify(logEntry));

  try {
    logToolCallToDatabase({
      callId,
      detail,
      name,
      outcome,
      policyJson: JSON.stringify(policy ?? null),
      timestamp,
    });
  } catch (error) {
    console.warn(
      JSON.stringify({
        detail:
          error instanceof Error ? error.message : "Unknown logging error.",
        timestamp: new Date().toISOString(),
        type: "ai_tool_call_log_error",
      }),
    );
  }
}

function parseToolArguments(rawArguments: string): unknown {
  try {
    return JSON.parse(rawArguments) as unknown;
  } catch {
    throw new Error("Tool arguments must be valid JSON.");
  }
}

function getStringArgument({
  parsedArguments,
  propertyName,
}: {
  parsedArguments: unknown;
  propertyName: string;
}): string {
  if (!parsedArguments || typeof parsedArguments !== "object") {
    throw new Error("Tool arguments must be an object.");
  }

  const argumentRecord = parsedArguments as Record<string, unknown>;
  const value = argumentRecord[propertyName];

  if (value === undefined) {
    throw new Error(`Missing required tool argument '${propertyName}'.`);
  }

  if (typeof value !== "string") {
    throw new Error(`Tool argument '${propertyName}' must be a string.`);
  }

  if (value.trim().length === 0) {
    throw new Error(`Tool argument '${propertyName}' cannot be empty.`);
  }

  return value;
}

function validateCountTextCharactersArguments(
  rawArguments: string,
): CountTextCharactersArguments {
  const parsedArguments = parseToolArguments(rawArguments);

  return {
    text: getStringArgument({ parsedArguments, propertyName: "text" }),
  };
}

function validateNormalizeSdkNameArguments(
  rawArguments: string,
): NormalizeSdkNameArguments {
  const parsedArguments = parseToolArguments(rawArguments);

  return {
    sdkName: getStringArgument({ parsedArguments, propertyName: "sdkName" }),
  };
}

const readOnlyPolicy: ToolPolicy = {
  allowedEffects: [
    "compute a deterministic result",
    "return data to the model",
  ],
  requiresConfirmation: false,
  riskLevel: "read_only",
};

const aiToolRegistry = {
  count_text_characters: defineAITool<CountTextCharactersArguments>({
    definition: {
      type: "function",
      name: "count_text_characters",
      description:
        "Use this when the student asks for the exact number of characters in a piece of text, including spaces and punctuation. Input needs the exact text to count.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: {
            type: "string",
            description:
              "The exact text whose characters should be counted, including spaces and punctuation.",
          },
        },
        required: ["text"],
      },
    },
    policy: readOnlyPolicy,
    validate: validateCountTextCharactersArguments,
    run({ text }: CountTextCharactersArguments): string {
      return JSON.stringify({
        characterCount: [...text].length,
        ok: true,
        text,
      });
    },
  }),
  normalize_sdk_name: defineAITool<NormalizeSdkNameArguments>({
    definition: {
      type: "function",
      name: "normalize_sdk_name",
      description:
        "Use this when the student asks to normalize or canonicalize an SDK name for labels, comparisons, or display.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          sdkName: {
            type: "string",
            description: "The SDK name to normalize.",
          },
        },
        required: ["sdkName"],
      },
    },
    policy: readOnlyPolicy,
    validate: validateNormalizeSdkNameArguments,
    run({ sdkName }: NormalizeSdkNameArguments): string {
      const normalizedName = sdkName
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\bsdk\b/gi, "SDK");

      return JSON.stringify({
        normalizedName,
        ok: true,
        originalName: sdkName,
      });
    },
  }),
} satisfies Record<string, RunnableAITool>;

export const aiTools: FunctionTool[] = Object.values(aiToolRegistry).map(
  (tool) => tool.definition,
);

export function runAIToolCall(
  toolCall: ResponseFunctionToolCall,
): ToolCallResult {
  const tool = aiToolRegistry[toolCall.name as keyof typeof aiToolRegistry];

  if (!tool) {
    logToolCall({
      callId: toolCall.call_id,
      detail: "No registered tool matched this call.",
      name: toolCall.name,
      outcome: "unknown",
    });

    return {
      name: toolCall.name,
      output: buildToolErrorOutput(`Unknown tool: ${toolCall.name}`),
    };
  }

  if (tool.policy.riskLevel === "destructive") {
    logToolCall({
      callId: toolCall.call_id,
      detail: "Destructive tools are blocked from autonomous execution.",
      name: toolCall.name,
      outcome: "blocked",
      policy: tool.policy,
    });

    return {
      name: toolCall.name,
      output: buildToolErrorOutput(
        "This tool is destructive and cannot run autonomously.",
      ),
    };
  }

  if (tool.policy.requiresConfirmation) {
    logToolCall({
      callId: toolCall.call_id,
      detail: "Tool requires confirmation before execution.",
      name: toolCall.name,
      outcome: "blocked",
      policy: tool.policy,
    });

    return {
      name: toolCall.name,
      output: buildToolErrorOutput(
        "This tool requires explicit user confirmation before it can run.",
      ),
    };
  }

  try {
    const output = tool.runRaw(toolCall.arguments);

    logToolCall({
      callId: toolCall.call_id,
      detail: "Tool validated and executed successfully.",
      name: toolCall.name,
      outcome: "executed",
      policy: tool.policy,
    });

    return {
      name: toolCall.name,
      output,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tool validation failed.";

    logToolCall({
      callId: toolCall.call_id,
      detail: message,
      name: toolCall.name,
      outcome: "validation_error",
      policy: tool.policy,
    });

    return {
      name: toolCall.name,
      output: buildToolErrorOutput(message),
    };
  }
}

export function buildToolResultInput(
  toolCalls: readonly ResponseFunctionToolCall[],
): { input: ResponseInputItem[]; results: ToolCallResult[] } {
  const results = toolCalls.map(runAIToolCall);
  const input = toolCalls.map(
    (toolCall, index): ResponseInputItem => ({
      type: "function_call_output",
      call_id: toolCall.call_id,
      output:
        results[index]?.output ??
        buildToolErrorOutput("Tool validation failed."),
    }),
  );

  return { input, results };
}
