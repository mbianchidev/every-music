const port = (name, fallback) => {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : fallback;
};

export const apiPort = port('E2E_API_PORT', 55474);
export const webPort = port('E2E_WEB_PORT', 4179);
export const apiOrigin = `http://127.0.0.1:${apiPort}`;
export const webOrigin = `http://127.0.0.1:${webPort}`;
