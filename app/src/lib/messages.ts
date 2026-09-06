export const TOO_MANY_FEATURES_THRESHOLD = 50;

export function shouldWarnFeatureCount(count: number): boolean {
  return count > TOO_MANY_FEATURES_THRESHOLD;
}
