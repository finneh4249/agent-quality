import { NormalisedResult } from '../types.js';

export function createNormalisedResultJson(result: NormalisedResult): string {
  return JSON.stringify(result, null, 2);
}
