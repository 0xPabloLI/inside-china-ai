/**
 * Analytics CSV Parser Utils — Parse TikTok Analytics CSV export into standardized JSON.
 *
 * Column names from TikTok export can vary between versions/languages.
 * This module uses fuzzy matching to map column names to standard fields.
 *
 * Extracted into a lib module for testability.
 */

// ─── Field keyword mapping ───

/**
 * Standard fields and their matching keywords.
 * A column name is matched to a field if it contains ANY of the keywords
 * (after normalization). Keywords are checked in order — first match wins.
 */
export const FIELD_KEYWORDS = {
  title: ["title", "名称", "标题"],
  postedAt: ["post time", "post date", "publish", "发布时间", "发布日期"],
  views: ["view", "播放", "观看"],
  avgWatchTime: ["watch time", "观看时长", "平均观看"],
  completionRate: ["completion", "完成", "watch %", "watch%"],
  shares: ["share", "分享", "转发"],
  saves: ["save", "收藏", "favorite"],
  comments: ["comment", "评论"],
  likes: ["like", "点赞", "赞"],
};

// ─── Column matching ───

/**
 * Normalize a column name for matching: lowercase + remove ASCII non-alphanumeric
 * (keeps CJK characters since they're used as keywords).
 */
export function normalizeColumnName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\u4e00-\u9fff]/g, "");
}

/**
 * Match a raw column name to a standard field.
 * @returns {string|null} Field name or null if no match.
 */
export function matchColumn(rawName) {
  const normalized = normalizeColumnName(rawName);
  if (!normalized) return null;

  for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
    for (const keyword of keywords) {
      const normKeyword = normalizeColumnName(keyword);
      if (normalized.includes(normKeyword)) {
        return field;
      }
    }
  }

  return null;
}

// ─── CSV parser ───

/**
 * Parse CSV content into headers + row objects.
 * Handles quoted values with embedded commas.
 *
 * @param {string} content - Raw CSV content
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
export function parseCSV(content) {
  if (!content || !content.trim()) {
    return { headers: [], rows: [] };
  }

  // Normalize line endings
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  // Remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Parse CSV line (handles quoted values)
  function parseLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  const headers = parseLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? "";
    }
    rows.push(row);
  }

  return { headers, rows };
}

// ─── Row mapping ───

/**
 * Parse a numeric value from a string. Returns null if not a valid number.
 */
function parseNumber(value) {
  if (value == null || value === "") return null;
  const cleaned = value.replace(/[,，%]/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Map a raw CSV row (keyed by original column names) to a standardized video object.
 * Uses fuzzy column matching to find the right fields.
 */
export function mapRowToVideo(row) {
  // Build a mapping from column name → field
  const fieldMap = {};
  for (const colName of Object.keys(row)) {
    const field = matchColumn(colName);
    if (field && !(field in fieldMap)) {
      fieldMap[field] = colName;
    }
  }

  // Build result with all standard fields, null for missing
  const result = {
    title: null,
    postedAt: null,
    views: null,
    avgWatchTime: null,
    completionRate: null,
    shares: null,
    saves: null,
    comments: null,
    likes: null,
  };

  for (const [field, colName] of Object.entries(fieldMap)) {
    const rawValue = row[colName];

    if (field === "title" || field === "postedAt" || field === "avgWatchTime") {
      // String fields
      result[field] = rawValue || null;
    } else {
      // Numeric fields
      result[field] = parseNumber(rawValue);
    }
  }

  return result;
}

// ─── Full CSV → JSON ───

/**
 * Parse a full TikTok Analytics CSV export into standardized JSON.
 *
 * @param {string} csvContent - Raw CSV file content
 * @returns {{ exportedAt: string, source: string, videos: object[] }}
 */
export function parseAnalyticsCSV(csvContent) {
  const { headers, rows } = parseCSV(csvContent);

  const videos = rows.map(mapRowToVideo);

  return {
    exportedAt: new Date().toISOString(),
    source: "csv",
    videos,
  };
}
