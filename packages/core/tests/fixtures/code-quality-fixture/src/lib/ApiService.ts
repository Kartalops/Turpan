// Architecture fixture — circular import detection
import { helper } from './helper.js';

export function apiService() {
  return 'api-service';
}

export function callHelper() {
  return helper();
}