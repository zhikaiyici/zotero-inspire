import { FUNDER_PATTERNS } from "./fundingPatterns";
import { FundingInfo } from "./types";
import { getPref } from "../../../utils/prefs";

/**
 * How the extracted funding list is narrowed before it is shown/copied.
 *  - "all":    every detected funder (DOE, NSF, ERC, NSFC, ...)
 *  - "china":  Chinese agencies only (NSFC, CAS, MoST, provincial funds, ...)
 *  - "nsfc":   NSFC grant numbers only (including NSFC joint programs)
 *  - "custom": a user-defined list matched by abbreviation or full name
 */
export type FundingFilterMode = "all" | "china" | "nsfc" | "custom";

/** Normalize a token for case/space-insensitive comparison. */
function normalizeToken(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Split a user-entered custom list into normalized tokens.
 * Accepts ASCII/Chinese commas, semicolons, the Chinese enumeration comma,
 * and newlines as separators.
 */
function parseCustomList(raw: string): string[] {
  return raw
    .split(/[,;、，；\n\r]+/)
    .map(normalizeToken)
    .filter((t) => t.length > 0);
}

/**
 * Build, once, the set of normalized match keys (short id, full name, and every
 * alias) for each funder so a user can type either an abbreviation ("NSFC") or a
 * full name ("National Natural Science Foundation of China").
 */
let keyIndex: Map<string, Set<string>> | null = null;
function getFunderKeyIndex(): Map<string, Set<string>> {
  if (keyIndex) return keyIndex;
  const index = new Map<string, Set<string>>();
  for (const funder of FUNDER_PATTERNS) {
    const keys = new Set<string>();
    keys.add(normalizeToken(funder.id));
    keys.add(normalizeToken(funder.name));
    for (const alias of funder.aliases) keys.add(normalizeToken(alias));
    index.set(funder.id, keys);
  }
  keyIndex = index;
  return index;
}

/** True if the string contains a CJK (Chinese) character. */
function hasCJK(s: string): boolean {
  return /[㐀-鿿]/.test(s);
}

/**
 * Does a user token match one of a funder's keys?
 *  - Latin/acronym tokens: exact match only, so short acronyms stay predictable
 *    (e.g. "MOST" resolves to the Chinese Ministry of Science and Technology,
 *    not Taiwan's MOST, whose alias is "MOST Taiwan" — not a bare "MOST").
 *  - Chinese tokens: match when the token is a substring of a registered key,
 *    so a natural short form like "重点研发计划" matches the registered alias
 *    "国家重点研发计划". Only this direction is allowed: the reverse (key is a
 *    substring of the token) would let e.g. "台湾科技部" match the Chinese MoST
 *    alias "科技部".
 */
function tokenMatchesKey(token: string, key: string): boolean {
  if (key === token) return true;
  if (token.length >= 2 && hasCJK(token) && hasCJK(key)) {
    return key.includes(token);
  }
  return false;
}

/**
 * Resolve a raw custom list into the set of funder ids whose id, full name, or
 * one of whose aliases matches a token (case/space-insensitive; Chinese tokens
 * also match by substring — see tokenMatchesKey).
 */
export function resolveCustomFunderIds(raw: string): Set<string> {
  const tokens = [...new Set(parseCustomList(raw))];
  const ids = new Set<string>();
  if (tokens.length === 0) return ids;
  const index = getFunderKeyIndex();
  for (const [id, keys] of index) {
    const matched = tokens.some((token) =>
      [...keys].some((key) => tokenMatchesKey(token, key)),
    );
    if (matched) ids.add(id);
  }
  return ids;
}

/** Read the configured filter mode, defaulting to "china". */
export function getFundingFilterMode(): FundingFilterMode {
  const mode = getPref("funding_filter_mode");
  if (mode === "all" || mode === "china" || mode === "nsfc" || mode === "custom") {
    return mode;
  }
  return "china";
}

/** Apply the configured funding filter to an extracted funding list. */
export function filterFunding(funding: FundingInfo[]): FundingInfo[] {
  const mode = getFundingFilterMode();
  switch (mode) {
    case "all":
      return funding;
    case "china":
      return funding.filter((f) => f.category === "china");
    case "nsfc":
      // All NSFC grant numbers, including NSFC joint programs
      // (NSFC-DFG, NSFC-JSPS, NSFC-RSF, NSFC-CERN), which are all NSFC-prefixed.
      return funding.filter((f) => /^NSFC(-|$)/.test(f.funderId));
    case "custom": {
      const raw = ((getPref("funding_filter_custom") as string) || "").trim();
      // Not configured yet → don't hide everything.
      if (raw.length === 0) return funding;
      const ids = resolveCustomFunderIds(raw);
      return funding.filter((f) => ids.has(f.funderId));
    }
    default:
      return funding;
  }
}
