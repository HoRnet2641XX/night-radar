export type AudienceCounts = {
  male: number;
  female: number;
  couple: number;
  unknown?: number;
};

function safeCount(value: number | undefined) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0;
}

export function summarizeAudience(counts: AudienceCounts, total?: number) {
  const male = safeCount(counts.male);
  const female = safeCount(counts.female);
  const couple = safeCount(counts.couple);
  const classified = male + female + couple;
  const hasTotal = Number.isFinite(total);
  const basisTotal = hasTotal ? safeCount(total) : classified + safeCount(counts.unknown);
  const unknown = hasTotal ? Math.max(0, basisTotal - classified) : safeCount(counts.unknown);
  const femaleRate = basisTotal > 0 ? Math.min(100, Math.round((female / basisTotal) * 100)) : 0;

  return {
    counts: { male, female, couple, unknown },
    total: basisTotal,
    classified,
    femaleRate,
    isConsistent: classified + unknown === basisTotal,
  };
}
