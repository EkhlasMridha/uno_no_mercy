/**
 * Bounded memory of recently processed command ids → their acknowledgement.
 * A retried or duplicated command returns the original result instead of executing twice.
 */
export class CommandCache<T> {
  private readonly entries = new Map<string, T>();

  constructor(private readonly capacity = 64) {}

  get(commandId: string): T | undefined {
    return this.entries.get(commandId);
  }

  set(commandId: string, result: T): void {
    this.entries.set(commandId, result);
    if (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }
}
