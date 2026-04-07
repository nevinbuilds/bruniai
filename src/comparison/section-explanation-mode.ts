export type SectionExplanationMode = "fast" | "detailed" | "off";

export function shouldExplainSection(
  status: "missing" | "problematic" | "matched",
  mode: SectionExplanationMode,
): boolean {
  if (mode === "off") {
    return false;
  }

  if (mode === "detailed") {
    return status !== "missing";
  }

  return status === "problematic";
}
