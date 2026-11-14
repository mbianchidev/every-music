export function requestError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}
