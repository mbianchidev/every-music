// Only use this type for messages safe to expose to API clients.
export class RequestError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'RequestError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function requestError(statusCode, code, message) {
  return new RequestError(statusCode, code, message);
}
