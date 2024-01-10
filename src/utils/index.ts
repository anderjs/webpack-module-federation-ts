export function properties<T>(target: T) {
  if (target) {
    return Object.keys(target as {}).length > 0;
  }

  console.log("No exposes property, skipping.");

  return false;
}
