/**
 * Public contract: CoreState snapshot
 * - JSON-serializable shape
 * - Versioned for future migrations
 */
export type CoreStateSnapshot = {
  version: number
  data: Record<string, unknown>
}
