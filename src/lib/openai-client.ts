import OpenAI from "openai";

const defaultAIFastModel = "openai/gpt-4o-mini";
const defaultAIFlagshipModel = "openai/gpt-4o";

export type AIModelTier = "auto" | "fast" | "flagship";

export type AIProviderTarget = "backup" | "primary";

type AIProviderConfig = {
  apiKey: string;
  baseURL?: string;
  fastModel: string;
  flagshipModel: string;
};

let primaryAIClient: OpenAI | undefined;
let backupAIClient: OpenAI | undefined;
let primaryAIProviderConfig: AIProviderConfig | undefined;
let backupAIProviderConfig: AIProviderConfig | undefined | null;

function readRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required to use the AI provider.`);
  }

  return value;
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function applyOptionalBaseURL(
  config: AIProviderConfig,
  baseURL: string | undefined,
): AIProviderConfig {
  if (!baseURL) {
    return config;
  }

  return { ...config, baseURL };
}

function getBackupAIProviderConfig(): AIProviderConfig | null {
  if (backupAIProviderConfig !== undefined) {
    return backupAIProviderConfig;
  }

  const apiKey = readOptionalEnv("AI_BACKUP_PROVIDER_API_KEY");

  if (!apiKey) {
    backupAIProviderConfig = null;
    return backupAIProviderConfig;
  }

  backupAIProviderConfig = applyOptionalBaseURL(
    {
      apiKey,
      fastModel:
        readOptionalEnv("AI_BACKUP_PROVIDER_FAST_MODEL") ?? defaultAIFastModel,
      flagshipModel:
        readOptionalEnv("AI_BACKUP_PROVIDER_FLAGSHIP_MODEL") ??
        defaultAIFlagshipModel,
    },
    readOptionalEnv("AI_BACKUP_PROVIDER_BASE_URL"),
  );

  return backupAIProviderConfig;
}

export function getAIProviderConfig(
  target: AIProviderTarget = "primary",
): AIProviderConfig {
  if (target === "backup") {
    const backupConfig = getBackupAIProviderConfig();

    if (!backupConfig) {
      throw new Error(
        "AI_BACKUP_PROVIDER_API_KEY is required to use the backup AI provider.",
      );
    }

    return backupConfig;
  }

  if (primaryAIProviderConfig) {
    return primaryAIProviderConfig;
  }

  primaryAIProviderConfig = applyOptionalBaseURL(
    {
      apiKey: readRequiredEnv("AI_PROVIDER_API_KEY"),
      fastModel:
        readOptionalEnv("AI_PROVIDER_FAST_MODEL") ??
        readOptionalEnv("AI_PROVIDER_MODEL") ??
        defaultAIFastModel,
      flagshipModel:
        readOptionalEnv("AI_PROVIDER_FLAGSHIP_MODEL") ?? defaultAIFlagshipModel,
    },
    readOptionalEnv("AI_PROVIDER_BASE_URL"),
  );

  return primaryAIProviderConfig;
}

export function hasBackupAIProvider(): boolean {
  return getBackupAIProviderConfig() !== null;
}

export function getAIModel(
  modelTier: Exclude<AIModelTier, "auto">,
  target: AIProviderTarget = "primary",
): string {
  const config = getAIProviderConfig(target);
  return modelTier === "flagship" ? config.flagshipModel : config.fastModel;
}

export function getAIClient(target: AIProviderTarget = "primary"): OpenAI {
  const config = getAIProviderConfig(target);

  if (target === "backup") {
    backupAIClient ??= new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });

    return backupAIClient;
  }

  primaryAIClient ??= new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });

  return primaryAIClient;
}
