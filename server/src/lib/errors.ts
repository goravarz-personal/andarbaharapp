/** An error with an HTTP status the error middleware knows how to render. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, message, 'bad_request', details);
  }

  static unauthorized(message = 'Please sign in again.'): ApiError {
    return new ApiError(401, message, 'unauthorized');
  }

  static forbidden(message = 'Only an admin can do that.'): ApiError {
    return new ApiError(403, message, 'forbidden');
  }

  static notFound(message = 'Not found.'): ApiError {
    return new ApiError(404, message, 'not_found');
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, message, 'conflict', details);
  }
}
