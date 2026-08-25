type RateWindow = { count: number; resetAt: number };
const windows = new Map<string, RateWindow>();

export function takeRateLimit(key: string, limit: number, windowMs: number) {
  const currentTime = Date.now();
  const current = windows.get(key);
  const next = !current || current.resetAt <= currentTime
    ? { count: 1, resetAt: currentTime + windowMs }
    : { count: current.count + 1, resetAt: current.resetAt };
  windows.set(key, next);

  if (windows.size > 5_000) {
    for (const [candidateKey, candidate] of windows) {
      if (candidate.resetAt <= currentTime) windows.delete(candidateKey);
    }
  }

  return {
    allowed: next.count <= limit,
    limit,
    remaining: Math.max(0, limit - next.count),
    resetAt: next.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((next.resetAt - currentTime) / 1000)),
  };
}
