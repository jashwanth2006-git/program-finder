/**
 * Question Number Normalization Utility
 * Standardizes formats like:
 *   "1"      -> "1"
 *   "1(a)"   -> "1(a)"
 *   "1a"     -> "1(a)"
 *   "1 A"    -> "1(a)"
 *   "1.a"    -> "1(a)"
 *   "Q1"     -> "1"
 *   "Q. 1(b)"-> "1(b)"
 *   "10(a)"  -> "10(a)"
 */

export function normalizeQuestionNumber(input: string): string {
  if (!input) return '';

  let cleaned = input.trim().toLowerCase();

  // Remove common prefixes like 'question', 'q.', 'q', 'prog', 'program', 'ex', 'exercise', 'problem', 'task'
  cleaned = cleaned.replace(/^(?:question|q\.|q|prog\.|prog|program|exercise|ex\.|ex|problem|task)\s*[:#-]?\s*/i, '');

  // Strip trailing periods or colons
  cleaned = cleaned.replace(/[:.]\s*$/, '').trim();

  // Pattern 1: Number followed by single letter in parens: 1(a), 1(b), 10(a)
  const parenMatch = cleaned.match(/^(\d+)\s*\(([a-z0-9]+)\)$/i);
  if (parenMatch) {
    return `${parenMatch[1]}(${parenMatch[2].toLowerCase()})`;
  }

  // Pattern 2: Number followed directly or separated by space/dot/dash with letter: "1a", "1 a", "1.a", "1-a"
  const letterMatch = cleaned.match(/^(\d+)\s*[\.\-\s]?\s*([a-z])$/i);
  if (letterMatch) {
    return `${letterMatch[1]}(${letterMatch[2].toLowerCase()})`;
  }

  // Pattern 3: Multi-level sub-questions: "1(a)(i)", "2.a.i"
  const multiSub = cleaned.match(/^(\d+)\s*\(([a-z])\)\s*\(([a-z0-9]+)\)$/i);
  if (multiSub) {
    return `${multiSub[1]}(${multiSub[2].toLowerCase()})(${multiSub[3].toLowerCase()})`;
  }

  // Pattern 4: Just pure number: "1", "01", "12"
  const numOnlyMatch = cleaned.match(/^(\d+)$/);
  if (numOnlyMatch) {
    // Remove leading zeros for clean matching (e.g. "01" -> "1")
    return String(parseInt(numOnlyMatch[1], 10));
  }

  // Pattern 5: Dotted sub-questions: "1.1", "2.3"
  const dottedMatch = cleaned.match(/^(\d+)\.(\d+)$/);
  if (dottedMatch) {
    return `${parseInt(dottedMatch[1], 10)}.${dottedMatch[2]}`;
  }

  // Fallback: strip spaces and lowercase
  return cleaned.replace(/\s+/g, '').toLowerCase();
}

/**
 * Checks if target question number matches user search query
 */
export function matchesQuestionNumber(target: string, query: string): boolean {
  if (!target || !query) return false;

  const normTarget = normalizeQuestionNumber(target);
  const normQuery = normalizeQuestionNumber(query);

  if (normTarget === normQuery) return true;

  // Secondary check: raw match without special chars
  const flatTarget = target.toLowerCase().replace(/[^a-z0-9]/g, '');
  const flatQuery = query.toLowerCase().replace(/[^a-z0-9]/g, '');

  return flatTarget === flatQuery;
}
