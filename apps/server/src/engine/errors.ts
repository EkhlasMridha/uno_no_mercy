import type { ErrorCode } from '@nomercy/shared';

/** Thrown inside the engine when a command violates the rules. Never leaves the reducer. */
export class RuleViolation extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RuleViolation';
  }
}

export function fail(code: ErrorCode, message: string): never {
  throw new RuleViolation(code, message);
}
