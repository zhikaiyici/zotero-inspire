import { config } from "../../../../package.json";
import { localCache } from "../localCache";
import type {
  PDFReferenceMapping,
  AuthorYearReferenceMapping,
  PDFPaperInfo,
} from "./pdfReferencesParser";

/**
 * FTR-PDF-PARSE-PERSIST (S5): persist parsed PDF reference-label mappings to the
 * on-disk localCache so a NEW session reads them instead of re-parsing the PDF.
 *
 * The in-memory pdfMappingCache / pdfAuthorYearMappingCache are cleared every
 * session, so without this the CPU-heavy reference-list parse ran once per
 * session per PDF. Entries are keyed by attachment item key and invalidated
 * whenever the PDF file's mtime or size changes.
 *
 * PDFReferenceMapping / AuthorYearReferenceMapping contain Map fields, which do
 * not survive JSON.stringify, so they are converted to entry arrays here and
 * rebuilt on load. PDFPaperInfo is a plain object (no nested Maps), so it
 * round-trips as-is.
 */

const CACHE_TYPE = "pdfmap" as const;

/** Bump when the persisted shape changes so old blobs are treated as misses. */
const SCHEMA_VERSION = 1;

/**
 * Stable cache key for a PDF attachment. Zotero item keys are only unique within
 * a library, so the library id is included to avoid cross-library collisions.
 */
export function pdfMappingCacheKey(attachment: Zotero.Item): string {
  return `${attachment.libraryID}-${attachment.key}`;
}

type Confidence = "high" | "medium" | "low";

interface SerializedNumeric {
  parsedAt: number;
  labelCounts: [string, number][];
  labelPaperInfos?: [string, PDFPaperInfo[]][];
  totalLabels: number;
  confidence: Confidence;
}

interface SerializedAuthorYear {
  parsedAt: number;
  authorYearMap: [string, PDFPaperInfo[]][];
  totalReferences: number;
  confidence: Confidence;
}

interface PersistedPdfParse {
  /** Persisted-shape version; a mismatch on load is treated as a miss */
  schemaVersion: number;
  /** PDF file mtime (epoch ms) at parse time — for invalidation */
  pdfMtime: number;
  /** PDF file size (bytes) at parse time — for invalidation */
  pdfSize: number;
  numeric?: SerializedNumeric;
  authorYear?: SerializedAuthorYear;
}

export interface LoadedPdfParse {
  numeric?: PDFReferenceMapping;
  authorYear?: AuthorYearReferenceMapping;
}

function serializeNumeric(m: PDFReferenceMapping): SerializedNumeric {
  return {
    parsedAt: m.parsedAt,
    labelCounts: Array.from(m.labelCounts.entries()),
    labelPaperInfos: m.labelPaperInfos
      ? Array.from(m.labelPaperInfos.entries())
      : undefined,
    totalLabels: m.totalLabels,
    confidence: m.confidence,
  };
}

function deserializeNumeric(s: SerializedNumeric): PDFReferenceMapping {
  return {
    parsedAt: s.parsedAt,
    labelCounts: new Map(s.labelCounts),
    labelPaperInfos: Array.isArray(s.labelPaperInfos)
      ? new Map(s.labelPaperInfos)
      : undefined,
    totalLabels: s.totalLabels,
    confidence: s.confidence,
  };
}

function serializeAuthorYear(
  m: AuthorYearReferenceMapping,
): SerializedAuthorYear {
  return {
    parsedAt: m.parsedAt,
    authorYearMap: Array.from(m.authorYearMap.entries()),
    totalReferences: m.totalReferences,
    confidence: m.confidence,
  };
}

function deserializeAuthorYear(
  s: SerializedAuthorYear,
): AuthorYearReferenceMapping {
  return {
    parsedAt: s.parsedAt,
    authorYearMap: new Map(s.authorYearMap),
    totalReferences: s.totalReferences,
    confidence: s.confidence,
  };
}

async function statPdf(
  pdfPath: string,
): Promise<{ mtime: number; size: number } | null> {
  try {
    const stat = await IOUtils.stat(pdfPath);
    const mtime = (stat as { lastModified?: number })?.lastModified;
    const size = (stat as { size?: number })?.size;
    if (typeof mtime === "number" && typeof size === "number") {
      return { mtime, size };
    }
  } catch {
    // File missing/unreadable — caller falls back to parsing.
  }
  return null;
}

/**
 * Persist a freshly parsed mapping for a PDF. No-op if caching is disabled, the
 * key is empty, both mappings are absent, or the file cannot be stat'd.
 */
export async function persistPdfParse(
  attachmentKey: string,
  pdfPath: string,
  numeric: PDFReferenceMapping | null | undefined,
  authorYear: AuthorYearReferenceMapping | null | undefined,
): Promise<void> {
  if (!localCache.isEnabled() || !attachmentKey) return;
  if (!numeric && !authorYear) return;
  const stat = await statPdf(pdfPath);
  if (!stat) return;
  try {
    const blob: PersistedPdfParse = {
      schemaVersion: SCHEMA_VERSION,
      pdfMtime: stat.mtime,
      pdfSize: stat.size,
      numeric: numeric ? serializeNumeric(numeric) : undefined,
      authorYear: authorYear ? serializeAuthorYear(authorYear) : undefined,
    };
    await localCache.set(CACHE_TYPE, attachmentKey, blob);
    Zotero.debug(
      `[${config.addonName}] [PDF-PARSE-PERSIST] Saved mapping for ${attachmentKey} (mtime=${stat.mtime}, size=${stat.size})`,
    );
  } catch (err) {
    Zotero.debug(
      `[${config.addonName}] [PDF-PARSE-PERSIST] Save failed for ${attachmentKey}: ${err}`,
    );
  }
}

/**
 * Load a persisted mapping for a PDF, or null on miss / disabled / stale (the
 * file's mtime or size changed since the parse was cached).
 */
export async function loadPersistedPdfParse(
  attachmentKey: string,
  pdfPath: string,
): Promise<LoadedPdfParse | null> {
  if (!localCache.isEnabled() || !attachmentKey) return null;
  const stat = await statPdf(pdfPath);
  if (!stat) return null;
  try {
    const cached = await localCache.get<PersistedPdfParse>(
      CACHE_TYPE,
      attachmentKey,
    );
    const blob = cached?.data;
    if (!blob) return null;
    // Treat an older persisted shape or a changed PDF file as a miss (re-parse).
    if (blob.schemaVersion !== SCHEMA_VERSION) return null;
    if (blob.pdfMtime !== stat.mtime || blob.pdfSize !== stat.size) {
      Zotero.debug(
        `[${config.addonName}] [PDF-PARSE-PERSIST] Stale cache for ${attachmentKey} (file changed), will re-parse`,
      );
      return null;
    }
    // Only accept mappings that clear the same quality bar the parse paths use
    // before caching in memory (numeric: totalLabels > 0; author-year: >= 5), and
    // that carry well-formed entry arrays.
    const result: LoadedPdfParse = {};
    if (
      blob.numeric &&
      Array.isArray(blob.numeric.labelCounts) &&
      blob.numeric.totalLabels > 0
    ) {
      result.numeric = deserializeNumeric(blob.numeric);
    }
    if (
      blob.authorYear &&
      Array.isArray(blob.authorYear.authorYearMap) &&
      blob.authorYear.authorYearMap.length >= 5
    ) {
      result.authorYear = deserializeAuthorYear(blob.authorYear);
    }
    if (!result.numeric && !result.authorYear) return null;
    Zotero.debug(
      `[${config.addonName}] [PDF-PARSE-PERSIST] Loaded mapping for ${attachmentKey} from disk`,
    );
    return result;
  } catch {
    return null;
  }
}
