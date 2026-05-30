import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
} from "openai";

export class AIRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "AIRequestError";
  }
}

type AIErrorDetails = {
  message: string;
  retryable: boolean;
  statusCode: number;
};

export function toAIRequestError(error: unknown): AIRequestError {
  const details = getAIErrorDetails(error);
  return new AIRequestError(details.message, details.statusCode);
}

export function shouldRetryAIRequest(error: unknown): boolean {
  return getAIErrorDetails(error).retryable;
}

export function shouldFallbackAIRequest(error: unknown): boolean {
  const details = getAIErrorDetails(error);
  return details.retryable || details.statusCode === 429;
}

function getAIErrorDetails(error: unknown): AIErrorDetails {
  if (error instanceof AuthenticationError) {
    return {
      message: "AI provider authentication failed. Check AI_PROVIDER_API_KEY.",
      retryable: false,
      statusCode: 401,
    };
  }

  if (error instanceof PermissionDeniedError) {
    return {
      message:
        "AI provider access was denied. Check the key permissions, provider account, and selected model.",
      retryable: false,
      statusCode: 403,
    };
  }

  if (error instanceof RateLimitError) {
    return {
      message: "AI provider rate limit hit. Wait a moment and try again.",
      retryable: true,
      statusCode: 429,
    };
  }

  if (error instanceof APIConnectionTimeoutError) {
    return {
      message: "AI provider request timed out. Try again shortly.",
      retryable: true,
      statusCode: 504,
    };
  }

  if (error instanceof APIConnectionError) {
    return {
      message:
        "Could not connect to the AI provider. Check AI_PROVIDER_BASE_URL and your network.",
      retryable: true,
      statusCode: 502,
    };
  }

  if (error instanceof APIError) {
    return {
      message: getAPIErrorMessage(error),
      retryable: isRetryableStatus(error.status),
      statusCode: error.status ?? 500,
    };
  }

  if (error instanceof Error && error.message.includes("AI_PROVIDER_")) {
    return {
      message: error.message,
      retryable: false,
      statusCode: 500,
    };
  }

  return {
    message: "AI provider request failed unexpectedly.",
    retryable: false,
    statusCode: 500,
  };
}

function getAPIErrorMessage(error: APIError): string {
  if (error.status === 400) {
    return "AI provider rejected the request. Check the input, model, and provider compatibility.";
  }

  if (error.status === 404) {
    return "AI provider endpoint or model was not found. Check AI_PROVIDER_BASE_URL and AI_PROVIDER_MODEL.";
  }

  if (error.status === 408) {
    return "AI provider request timed out. Try again shortly.";
  }

  if (error.status && error.status >= 500) {
    return "AI provider is temporarily unavailable. Try again shortly.";
  }

  return "AI provider request failed. Check provider settings and try again.";
}

function isRetryableStatus(status: number | undefined): boolean {
  return (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    Boolean(status && status >= 500)
  );
}
