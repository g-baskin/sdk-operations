import { shouldRetryAIRequest, toAIRequestError } from "./ai-errors";

const maxAttempts = 3;
const baseBackoffMs = 300;

type RetriableOperation<T> = () => Promise<T>;

export async function withAIRetry<T>(
  operation: RetriableOperation<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!shouldRetryAIRequest(error) || attempt === maxAttempts) {
        break;
      }

      await wait(baseBackoffMs * attempt);
    }
  }

  throw toAIRequestError(lastError);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
