/**
 * Fetch wrapper with automatic retry logic for transient errors
 * Implements exponential backoff for 5xx errors and 429 rate limits
 */

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 8000,
};

const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const delay = baseDelay * Math.pow(2, attempt);
  return Math.min(delay, maxDelay);
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: RetryOptions
): Promise<Response> {
  const { maxRetries, baseDelay, maxDelay } = { ...DEFAULT_OPTIONS, ...options };
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(input, init);
      
      // If successful or non-retryable error, return immediately
      if (response.ok || !RETRYABLE_STATUS_CODES.includes(response.status)) {
        return response;
      }
      
      // If retryable error and we have retries left
      if (attempt < maxRetries) {
        const delay = calculateDelay(attempt, baseDelay, maxDelay);
        console.log(`Request failed with ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(delay);
        continue;
      }
      
      // No retries left, return the failed response
      return response;
    } catch (error) {
      lastError = error as Error;
      
      // Network errors are retryable
      if (attempt < maxRetries) {
        const delay = calculateDelay(attempt, baseDelay, maxDelay);
        console.log(`Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}):`, error);
        await sleep(delay);
        continue;
      }
      
      throw error;
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw lastError || new Error("Max retries exceeded");
}
