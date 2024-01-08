export function properties<T>(target: T) {
  return Object.keys(target as {}).length > 0;
}