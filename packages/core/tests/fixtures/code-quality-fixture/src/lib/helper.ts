// Architecture fixture — circular import detection (part 2)
import { apiService } from './ApiService.js';

export function helper() {
  return 'helper';
}

export function callApiService() {
  return apiService();
}