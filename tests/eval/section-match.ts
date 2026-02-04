/**
 * Matching logic for section extraction eval.
 *
 * Normalizes labels and compares expected section names to extracted
 * sections (name + sectionId). Returns matched, missing, and extra.
 */

export interface ExtractedSection {
  name: string;
  sectionId: string;
}

export interface SectionMatchResult {
  matched: string[];
  missing: string[];
  extra: ExtractedSection[];
  pass: boolean;
  score: number;
}

/**
 * Normalize a label for comparison: lowercase, trim, collapse / and spaces.
 */
export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\s+|\s+$/g, "");
}

function firstTwoWords(s: string): string {
  const words = s.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).join(" ");
}

/**
 * Check if any word from expected overlaps with extracted text (substring or prefix).
 * E.g. "Nav" matches "Header / Navigation" (nav is substring of navigation).
 */
function wordOverlap(expectedNorm: string, extractedNorm: string): boolean {
  const expectedWords = expectedNorm.split(/\s+/).filter(Boolean);
  const extractedWords = extractedNorm.split(/\s+/).filter(Boolean);
  for (const ew of expectedWords) {
    for (const exw of extractedWords) {
      if (
        ew.length >= 2 &&
        exw.length >= 2 &&
        (ew.includes(exw) ||
          exw.includes(ew) ||
          ew.startsWith(exw) ||
          exw.startsWith(ew))
      )
        return true;
    }
  }
  if (extractedNorm.length >= 2) {
    for (const ew of expectedWords) {
      if (
        ew.length >= 2 &&
        (ew.includes(extractedNorm) ||
          extractedNorm.includes(ew) ||
          ew.startsWith(extractedNorm) ||
          extractedNorm.startsWith(ew))
      )
        return true;
    }
  }
  if (expectedNorm.length >= 2) {
    for (const exw of extractedWords) {
      if (
        exw.length >= 2 &&
        (expectedNorm.includes(exw) ||
          exw.includes(expectedNorm) ||
          expectedNorm.startsWith(exw) ||
          exw.startsWith(expectedNorm))
      )
        return true;
    }
  }
  return false;
}

/**
 * Check if expected label matches an extracted section (by name or sectionId).
 * Match: normalized equality, one contains the other, first two words match,
 * or any word overlaps (e.g. "Nav" vs "Navigation", "Header" vs "Nav" via header/nav).
 */
function expectedMatchesExtracted(
  expectedNorm: string,
  extracted: ExtractedSection,
): boolean {
  const nameNorm = normalizeLabel(extracted.name);
  const idNorm = normalizeLabel(extracted.sectionId);
  if (expectedNorm === nameNorm || expectedNorm === idNorm) return true;
  if (nameNorm.includes(expectedNorm) || expectedNorm.includes(nameNorm))
    return true;
  if (idNorm.includes(expectedNorm) || expectedNorm.includes(idNorm))
    return true;
  const expectedStart = firstTwoWords(expectedNorm);
  if (
    expectedStart.length >= 2 &&
    (firstTwoWords(nameNorm) === expectedStart ||
      firstTwoWords(idNorm) === expectedStart)
  )
    return true;
  if (wordOverlap(expectedNorm, nameNorm) || wordOverlap(expectedNorm, idNorm))
    return true;
  return false;
}

export interface MatchSectionsOptions {
  /** Pass if score >= this (0–1). Default 1 = all expected must match. */
  minScore?: number;
}

/**
 * Compare expected section names to extracted sections.
 * Each expected is matched if any extracted section matches it.
 * Extracted sections that did not match any expected are "extra".
 * Pass when missing.length === 0, or when score >= options.minScore if set.
 */
export function matchSections(
  expectedSections: string[],
  extracted: ExtractedSection[],
  options: MatchSectionsOptions = {},
): SectionMatchResult {
  const { minScore } = options;
  const matched: string[] = [];
  const missing: string[] = [];
  const used = new Set<number>();

  for (const expected of expectedSections) {
    const expectedNorm = normalizeLabel(expected);
    const idx = extracted.findIndex(
      (ex, i) => !used.has(i) && expectedMatchesExtracted(expectedNorm, ex),
    );
    if (idx >= 0) {
      matched.push(expected);
      used.add(idx);
    } else {
      missing.push(expected);
    }
  }

  const extra = extracted.filter((_, i) => !used.has(i));

  const score =
    expectedSections.length === 0
      ? 1
      : matched.length / expectedSections.length;
  const pass = missing.length === 0 || (minScore != null && score >= minScore);

  return {
    matched,
    missing,
    extra,
    pass,
    score,
  };
}
