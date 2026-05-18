/**
 * Centralized TanStack Query key schema (per plan §16.14).
 *
 * Keep keys structural and human-readable. Day 8 only uses `me`; the rest
 * are declared as placeholders so Day 9+ doesn't sprinkle ad-hoc keys
 * around the codebase. Stable shape = predictable invalidation.
 */
export const queryKeys = {
  me: ['me'] as const,
  monitors: () => ['monitors'] as const,
  monitor: (id: string) => ['monitor', id] as const,
  monitorStats: (id: string) => ['monitor', id, 'stats'] as const,
  monitorChecks: (id: string, limit: number) =>
    ['monitor', id, 'checks', { limit }] as const,
};
