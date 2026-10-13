/**
 * Multi-tier fuzzy matching and canonicalization engine for CIPL & DRA document imports.
 *
 * Provides deterministic, multi-field matching across:
 * - Internal item code (`code`)
 * - Customer item code (`customerItemCode`)
 * - Supplier part number (`supplierItemCode`)
 * - Dyna-Serv item number (`dsgcItemNumber`)
 * - Item name / description
 *
 * Scoring Tiers:
 * - 100: Exact match (case-insensitive)
 * - 95: Canonical match (punctuation, whitespace, leading zeroes stripped)
 * - 88: Packaging/revision suffix stripped or prefix/suffix containment
 * - 70-85: Levenshtein distance similarity
 * - 65-75: Description token Jaccard overlap
 */

export interface MatchableItem {
  id: string;
  code: string;
  name?: string | null;
  customerItemCode?: string | null;
  supplierItemCode?: string | null;
  dsgcItemNumber?: string | null;
  defaultSupplierPartyId?: string | null;
}

export type MatchTier = "exact" | "canonical" | "stripped_suffix" | "fuzzy" | "description";

export type MatchedField = "code" | "customerItemCode" | "supplierItemCode" | "dsgcItemNumber" | "name";

export interface MatchCandidate<T extends MatchableItem = MatchableItem> {
  item: T;
  score: number; // 0 to 100
  tier: MatchTier;
  matchReason: string;
  matchedField: MatchedField;
  queryToken: string;
}

export interface MatchResult<T extends MatchableItem = MatchableItem> {
  bestMatch: MatchCandidate<T> | null;
  candidates: MatchCandidate<T>[];
  confidenceLevel: "high" | "medium" | "low" | "none";
}

export interface MatchOptions {
  preferredPartyId?: string | null;
  minScoreThreshold?: number;
  maxCandidates?: number;
}

/**
 * Normalizes a part code by lowercasing, stripping punctuation/symbols,
 * and removing non-essential leading zeroes while retaining single zero.
 */
export function normalizeCode(val: string): string {
  if (!val) return "";
  const cleaned = val
    .toLowerCase()
    .trim()
    .replace(/[\s\-_./\\#,:;*+~()\[\]{}|]+/g, "");
  if (!cleaned) return "";

  const strippedZeros = cleaned.replace(/^0+/, "");
  return strippedZeros === "" ? "0" : strippedZeros;
}

/**
 * Regex identifying common semiconductor, electronic, and packaging suffixes.
 */
const PACKAGING_SUFFIX_REGEX =
  /[-_\s]?(?:tape\s*&?\s*reel|tape|reel|tr|t\/r|t&r|bulk|tray|tube|ammo|strip|cut|bag|pkg|box|ctn|spq|pb[-_]?free|lead[-_]?free|rohs|green|lf|g|rohs[-_]?compliant|\b(?:rev[0-9a-z]*|v[0-9]+))\s*$/i;

/**
 * Strips packaging, reel, tape, and compliance suffixes.
 * E.g., "7788-TR" -> "7788", "ABC1234(ROHS)" -> "ABC1234", "BC547B-REEL" -> "BC547B".
 */
export function stripPackagingSuffix(code: string): string {
  if (!code) return "";
  let cleaned = code.trim();
  // Strip trailing bracketed tokens
  cleaned = cleaned.replace(
    /\s*\((?:tr|t&r|reel|bulk|tape|rohs|lf|g|green|lead[-_]?free|pb[-_]?free|rev[0-9a-z]*)\)\s*$/i,
    ""
  );
  // Strip trailing dash/underscore suffix
  cleaned = cleaned.replace(PACKAGING_SUFFIX_REGEX, "");
  return cleaned.trim();
}

/**
 * Computes standard Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  if (!s1.length) return s2.length;
  if (!s2.length) return s1.length;

  let prev = Array.from({ length: s2.length + 1 }, (_, i) => i);
  let curr = new Array(s2.length + 1);

  for (let i = 1; i <= s1.length; i++) {
    curr[0] = i;
    const c1 = s1[i - 1];
    for (let j = 1; j <= s2.length; j++) {
      const c2 = s2[j - 1];
      const cost = c1 === c2 ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost // substitution
      );
    }
    const temp = prev;
    prev = curr;
    curr = temp;
  }
  return prev[s2.length];
}

/**
 * Computes normalized string similarity ratio from 0.0 to 1.0 based on edit distance.
 */
export function similarityRatio(s1: string, s2: string): number {
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(s1, s2);
  return (maxLen - dist) / maxLen;
}

/**
 * Tokenizes text and computes Jaccard similarity across significant words.
 */
export function tokenJaccardSimilarity(s1: string, s2: string): number {
  const stopWords = new Set([
    "the", "and", "or", "for", "with", "pcs", "box", "pkg", "part", "item", "unit", "nos",
    "description", "desc", "model", "type", "specification", "spec"
  ]);

  const getTokens = (str: string) =>
    new Set(
      str
        .toLowerCase()
        .split(/[\s\-_.,/\\#;:()\[\]{}|]+/)
        .filter((w) => w.length >= 2 && !stopWords.has(w))
    );

  const t1 = getTokens(s1);
  const t2 = getTokens(s2);
  if (t1.size === 0 || t2.size === 0) return 0;

  let intersection = 0;
  for (const token of t1) {
    if (t2.has(token)) intersection++;
  }
  const union = new Set([...t1, ...t2]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Evaluates a single catalog item against input query codes and description.
 */
function evaluateItem<T extends MatchableItem>(
  item: T,
  queryCodes: { token: string; norm: string; stripped: string }[],
  queryDesc: string | undefined
): MatchCandidate<T> | null {
  const rawFields: { field: MatchedField; raw: string; label: string }[] = [
    { field: "code", raw: item.code, label: "Item Code" },
    { field: "customerItemCode", raw: item.customerItemCode ?? "", label: "Cust P/N" },
    { field: "supplierItemCode", raw: item.supplierItemCode ?? "", label: "Supplier P/N" },
    { field: "dsgcItemNumber", raw: item.dsgcItemNumber ?? "", label: "DSGC P/N" },
  ];
  const targetFields = rawFields.filter((t) => Boolean(t.raw && t.raw.trim().length > 0));

  let bestCandidate: MatchCandidate<T> | null = null;

  for (const q of queryCodes) {
    if (!q.token) continue;
    const qLower = q.token.toLowerCase();

    for (const t of targetFields) {
      const tRaw = t.raw;
      const tLower = tRaw.toLowerCase();
      const tNorm = normalizeCode(tRaw);
      const tStripped = normalizeCode(stripPackagingSuffix(tRaw));

      // 1. Exact match (case-insensitive)
      if (qLower === tLower) {
        return {
          item,
          score: 100,
          tier: "exact",
          matchReason: `Exact match on ${t.label}`,
          matchedField: t.field,
          queryToken: q.token,
        };
      }

      // 2. Canonical match (delimiters and leading zeroes stripped)
      if (q.norm.length >= 2 && q.norm === tNorm) {
        const candidate: MatchCandidate<T> = {
          item,
          score: 95,
          tier: "canonical",
          matchReason: `Matched ${t.label} (normalized delimiters/spaces)`,
          matchedField: t.field,
          queryToken: q.token,
        };
        if (!bestCandidate || candidate.score > bestCandidate.score) {
          bestCandidate = candidate;
        }
        continue;
      }

      // 3. Packaging/Revision suffix stripped match or prefix containment
      const strippedQ = q.stripped;
      if (
        (strippedQ.length >= 3 && (strippedQ === tNorm || strippedQ === tStripped)) ||
        (tStripped.length >= 3 && q.norm === tStripped)
      ) {
        const candidate: MatchCandidate<T> = {
          item,
          score: 88,
          tier: "stripped_suffix",
          matchReason: `Matched ${t.label} (packaging suffix stripped)`,
          matchedField: t.field,
          queryToken: q.token,
        };
        if (!bestCandidate || candidate.score > bestCandidate.score) {
          bestCandidate = candidate;
        }
        continue;
      }

      // 3b. Suffix / Substring containment for codes >= 4 characters
      if (
        (q.norm.length >= 4 && tNorm.length >= 6 && tNorm.endsWith(q.norm)) ||
        (tNorm.length >= 4 && q.norm.length >= 6 && q.norm.endsWith(tNorm))
      ) {
        const candidate: MatchCandidate<T> = {
          item,
          score: 86,
          tier: "stripped_suffix",
          matchReason: `Matched ${t.label} (code containment)`,
          matchedField: t.field,
          queryToken: q.token,
        };
        if (!bestCandidate || candidate.score > bestCandidate.score) {
          bestCandidate = candidate;
        }
        continue;
      }

      // 4. Fuzzy Levenshtein Distance
      if (q.norm.length >= 4 && tNorm.length >= 4) {
        const ratio = similarityRatio(q.norm, tNorm);
        if (ratio >= 0.8) {
          const score = Math.round(65 + ratio * 20); // 81 to 85
          const pct = Math.round(ratio * 100);
          const candidate: MatchCandidate<T> = {
            item,
            score,
            tier: "fuzzy",
            matchReason: `Fuzzy match on ${t.label} (${pct}% similarity)`,
            matchedField: t.field,
            queryToken: q.token,
          };
          if (!bestCandidate || candidate.score > bestCandidate.score) {
            bestCandidate = candidate;
          }
        }
      }
    }
  }

  // 5. Description token overlap as fallback (if candidate score < 75)
  if (queryDesc && item.name && (!bestCandidate || bestCandidate.score < 75)) {
    const jaccard = tokenJaccardSimilarity(queryDesc, item.name);
    if (jaccard >= 0.35) {
      const score = Math.min(75, Math.round(55 + jaccard * 35));
      const pct = Math.round(jaccard * 100);
      const candidate: MatchCandidate<T> = {
        item,
        score,
        tier: "description",
        matchReason: `Description overlap (${pct}%)`,
        matchedField: "name",
        queryToken: queryDesc,
      };
      if (!bestCandidate || candidate.score > bestCandidate.score) {
        bestCandidate = candidate;
      }
    }
  }

  return bestCandidate;
}

/**
 * Matches extracted document query terms against an active items catalog.
 *
 * @param query.itemCode Extracted primary item code or part number.
 * @param query.customerItemCode Extracted customer-specific part number.
 * @param query.description Extracted item description or title.
 * @param catalog List of active master catalog items.
 * @param options Matching options (preferred vendor party ID, min score, etc.)
 */
export function matchItemAgainstCatalog<T extends MatchableItem>(
  query: {
    itemCode?: string | null;
    customerItemCode?: string | null;
    description?: string | null;
  },
  catalog: T[],
  options: MatchOptions = {}
): MatchResult<T> {
  const minThreshold = options.minScoreThreshold ?? 50;
  const maxCandidates = options.maxCandidates ?? 5;

  const rawTokens = [
    query.itemCode?.trim(),
    query.customerItemCode?.trim(),
  ].filter((t): t is string => Boolean(t && t.length > 0));

  // If no codes provided, check if description contains potential part number tokens
  if (rawTokens.length === 0 && query.description) {
    const desc = query.description.trim();
    const words = desc.split(/[\s,;()]+/);
    for (const w of words) {
      const cleanW = w.replace(/^[^\w]+|[^\w]+$/g, "");
      if (
        cleanW.length >= 3 &&
        cleanW.length <= 25 &&
        (/\d/.test(cleanW) || /[-_]/.test(cleanW))
      ) {
        rawTokens.push(cleanW);
      }
    }
  }

  const queryCodes = rawTokens.map((t) => ({
    token: t,
    norm: normalizeCode(t),
    stripped: normalizeCode(stripPackagingSuffix(t)),
  }));

  const queryDesc = query.description?.trim();

  if (queryCodes.length === 0 && (!queryDesc || queryDesc.length < 3)) {
    return {
      bestMatch: null,
      candidates: [],
      confidenceLevel: "none",
    };
  }

  const candidateMap = new Map<string, MatchCandidate<T>>();

  for (const item of catalog) {
    const candidate = evaluateItem(item, queryCodes, queryDesc);
    if (candidate && candidate.score >= minThreshold) {
      const existing = candidateMap.get(item.id);
      if (!existing || candidate.score > existing.score) {
        candidateMap.set(item.id, candidate);
      }
    }
  }

  const candidates = Array.from(candidateMap.values())
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (options.preferredPartyId) {
        const aPref = a.item.defaultSupplierPartyId === options.preferredPartyId ? 1 : 0;
        const bPref = b.item.defaultSupplierPartyId === options.preferredPartyId ? 1 : 0;
        if (bPref !== aPref) return bPref - aPref;
      }
      return 0;
    })
    .slice(0, maxCandidates);

  const bestMatch = candidates.length > 0 ? candidates[0] : null;

  let confidenceLevel: MatchResult<T>["confidenceLevel"] = "none";
  if (bestMatch) {
    if (bestMatch.score >= 85) {
      confidenceLevel = "high";
    } else if (bestMatch.score >= 65) {
      confidenceLevel = "medium";
    } else {
      confidenceLevel = "low";
    }
  }

  return {
    bestMatch,
    candidates,
    confidenceLevel,
  };
}
