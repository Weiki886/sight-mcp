const baseBackoffMs = 250;
const maximumBackoffMs = 5_000;
const maximumRetryAfterMs = 30_000;

function retryAfterMilliseconds(value: string | null, now: number): number | undefined {
  if (value === null) {
    return undefined;
  }
  if (/^\d+$/u.test(value)) {
    const milliseconds = Number(value) * 1_000;
    return Number.isSafeInteger(milliseconds) && milliseconds <= maximumRetryAfterMs
      ? milliseconds
      : undefined;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }
  const milliseconds = Math.max(0, timestamp - now);
  return milliseconds <= maximumRetryAfterMs ? milliseconds : undefined;
}

export function retryDelayMilliseconds(
  retryIndex: number,
  retryAfter: string | null,
  now: number,
  random: number,
): number {
  const providerDelay = retryAfterMilliseconds(retryAfter, now);
  if (providerDelay !== undefined) {
    return providerDelay;
  }

  const boundedRandom = Math.min(1, Math.max(0, random));
  const exponential = Math.min(maximumBackoffMs, baseBackoffMs * 2 ** retryIndex);
  return Math.min(maximumBackoffMs, Math.round(exponential * (0.5 + boundedRandom)));
}
