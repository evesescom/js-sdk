/**
 * Error hierarchy for the Eveses SDK.
 *
 * Every non-2xx response is converted into an EvesesError subclass:
 *   400/422 → EvesesValidationError
 *   401     → EvesesAuthError
 *   403     → EvesesForbiddenError
 *   404     → EvesesNotFoundError
 *   429     → EvesesRateLimitError (after the 1 auto-retry has been exhausted)
 *   5xx     → EvesesServerError
 *   other   → EvesesError
 */

export class EvesesError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly body?: unknown;

  constructor(message: string, status: number, opts: { code?: string; body?: unknown } = {}) {
    super(message);
    this.name = 'EvesesError';
    this.status = status;
    this.code = opts.code;
    this.body = opts.body;
    // Restore prototype chain (downlevel TS targets).
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EvesesAuthError extends EvesesError {
  constructor(message: string, body?: unknown) {
    super(message || 'Unauthenticated', 401, { code: 'unauthenticated', body });
    this.name = 'EvesesAuthError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EvesesForbiddenError extends EvesesError {
  constructor(message: string, body?: unknown) {
    super(message || 'Forbidden', 403, { code: 'forbidden', body });
    this.name = 'EvesesForbiddenError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EvesesNotFoundError extends EvesesError {
  constructor(message: string, body?: unknown) {
    super(message || 'Not found', 404, { code: 'not_found', body });
    this.name = 'EvesesNotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EvesesValidationError extends EvesesError {
  public readonly errors?: Record<string, string[]>;

  constructor(message: string, status: number, body?: unknown) {
    super(message || 'Validation failed', status, { code: 'validation_failed', body });
    this.name = 'EvesesValidationError';
    if (body && typeof body === 'object' && 'errors' in (body as Record<string, unknown>)) {
      this.errors = (body as { errors?: Record<string, string[]> }).errors;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EvesesRateLimitError extends EvesesError {
  public readonly retryAfter?: number;

  constructor(message: string, retryAfter?: number, body?: unknown) {
    super(message || 'Rate limited', 429, { code: 'rate_limited', body });
    this.name = 'EvesesRateLimitError';
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EvesesServerError extends EvesesError {
  constructor(message: string, status: number, body?: unknown) {
    super(message || 'Server error', status, { code: 'server_error', body });
    this.name = 'EvesesServerError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
