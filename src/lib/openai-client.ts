import OpenAI from "openai";

const defaultAIModel = "gpt-4.1-mini";

type AIProviderConfig = {
  apiKey: string;
  baseURL?: string;
  model: string;
};

let openAIClient: OpenAI | undefined;
let aiProviderConfig: AIProviderConfig | undefined;

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

export function getAIProviderConfig(): AIProviderConfig {
  if (aiProviderConfig) {
    return aiProviderConfig;
  }

  const baseURL = readOptionalEnv("AI_PROVIDER_BASE_URL");
  const config: AIProviderConfig = {
    apiKey: readRequiredEnv("AI_PROVIDER_API_KEY"),
    model: readOptionalEnv("AI_PROVIDER_MODEL") ?? defaultAIModel,
  };

  if (baseURL) {
    config.baseURL = baseURL;
  }

  aiProviderConfig = config;
  return config;
}

export function getAIClient(): OpenAI {
  const config = getAIProviderConfig();

  openAIClient ??= new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });

  return openAIClient;
}
