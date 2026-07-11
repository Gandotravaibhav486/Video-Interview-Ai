export const PARAMETER_WEIGHTS: Record<string, { weight: number; label: string }> = {
  content_relevance: { weight: 0.25, label: "Content & Structure" },
  delivery_confidence: { weight: 0.2, label: "Delivery & Confidence" },
  communication_clarity: { weight: 0.2, label: "Clarity & Fluency" },
  professionalism_appearance: { weight: 0.15, label: "Attire & Professionalism" },
  body_language: { weight: 0.2, label: "Posture & Body Language" },
};

export function weightedOverallScore(
  scores: Record<string, number>,
  weights: Record<string, { weight: number; label: string }> = PARAMETER_WEIGHTS
): number {
  const entries = Object.entries(scores);
  if (entries.length === 0) return 0;

  let totalWeight = 0;
  let weightedSum = 0;
  for (const [key, score] of entries) {
    const weight = weights[key]?.weight ?? 1 / entries.length;
    weightedSum += score * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}
