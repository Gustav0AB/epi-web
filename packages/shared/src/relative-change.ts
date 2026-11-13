export function relativeChange(initial: number | null, later: number | null): number | null {
  if (initial === null || later === null || !Number.isFinite(initial) || !Number.isFinite(later) || initial === 0) return null;
  const change = (later / initial - 1) * 100;
  return Number.isFinite(change) ? change : null;
}
