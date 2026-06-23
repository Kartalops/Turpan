// Architecture fixture — scattered env usage
const API_URL = process.env.REACT_APP_API_URL ?? 'http://localhost:3000';
const API_KEY = process.env.REACT_APP_API_KEY ?? 'dev-key';
const TIMEOUT = parseInt(process.env.REACT_APP_TIMEOUT ?? '5000', 10);
const ENABLE_DEBUG = process.env.REACT_APP_DEBUG === 'true';
const MAX_RETRIES = parseInt(process.env.REACT_APP_MAX_RETRIES ?? '3', 10);
const LOG_LEVEL = process.env.REACT_APP_LOG_LEVEL ?? 'info';
const ENABLE_CACHE = process.env.REACT_APP_ENABLE_CACHE !== 'false';
const CACHE_TTL = parseInt(process.env.REACT_APP_CACHE_TTL ?? '3600', 10);

console.log('API_URL:', API_URL);
console.log('ENABLE_DEBUG:', ENABLE_DEBUG);

export function getConfig() {
  return {
    apiUrl: API_URL,
    apiKey: API_KEY,
    timeout: TIMEOUT,
    maxRetries: MAX_RETRIES,
    enableCache: ENABLE_CACHE,
    cacheTtl: CACHE_TTL,
    logLevel: LOG_LEVEL,
  };
}
