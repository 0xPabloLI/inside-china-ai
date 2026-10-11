/**
 * Hashtag effect tracker — upsert semantics (#555 follow-up).
 *
 * Why this module exists: the tracker file (`output/hashtag-effect-tracker.jsonl`)
 * used to be appended to by hand, one FULL snapshot per analytics cycle. A video
 * therefore appeared several times under different caption truncations, sometimes
 * with a different hashtag set — which silently corrupts per-tag attribution
 * (2026-10-11: a "6 vs 6" comparison was really 6 distinct videos against 5).
 *
 * The contract now: one record per video, keyed by `videoId`. Metrics are a
 * time series (freshest wins, nulls never wipe); identity fields are not (take
 * the most informative value); hashtag changes are kept as history rather than
 * lost. Re-running the same observation is a no-op, so the cycle can safely
 * re-run after a partial failure.
 *
 * Records without a `videoId` predate this contract. They are preserved verbatim
 * and never merged — there is no safe key for them, and dropping them would
 * destroy history that cannot be re-fetched (the content list only keeps the
 * most recent 8 videos).
 *
 * @module hashtag-tracker
 */

/** Fields whose value is a measurement, not an identity. */
const METRIC_FIELDS = [
  "views",
  "likes",
  "comments",
  "fypPercent",
  "searchPercent",
  "avgWatchTimeSec",
  "watchedFullVideoPct",
];

/** Identity fields: not a time series, so the most informative value wins. */
const IDENTITY_FIELDS = ["videoTitle", "publishedAt"];

const LIST_FIELDS = ["hashtags", "searchQueries"];

// ─── JSONL I/O ───

/**
 * Parse JSONL text into records, skipping blank lines.
 *
 * @param {string} text
 * @returns {Array<object>}
 * @throws {Error} naming the offending 1-based line on invalid JSON
 */
export function parseJsonl(text) {
  const out = [];
  const lines = String(text ?? "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch (err) {
      throw new Error(`Invalid JSON on line ${i + 1}: ${err.message}`);
    }
  }
  return out;
}

/**
 * Serialize records to JSONL (one object per line, trailing newline).
 *
 * @param {Array<object>} records
 * @returns {string}
 */
export function serializeJsonl(records) {
  if (!records || records.length === 0) return "";
  return records.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

// ─── Normalization ───

function toIso(value, field) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ${field}: ${JSON.stringify(value)}`);
  }
  return d.toISOString();
}

function toNumber(value, field) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid ${field}: ${JSON.stringify(value)}`);
  }
  return n;
}

/**
 * Validate and normalize one observation before it enters the tracker.
 *
 * A `videoId` is required and must be a string: TikTok ids (19 digits) exceed
 * `Number.MAX_SAFE_INTEGER`, so a JSON numeric id silently loses its low digits
 * and would key two different videos to the same record.
 *
 * @param {object} raw
 * @param {object} [opts]
 * @param {Date} [opts.now] - recordedAt fallback (seam for tests)
 * @returns {object} normalized record
 */
export function normalizeObservation(raw, opts = {}) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Observation must be an object");
  }
  const { videoId } = raw;
  if (typeof videoId !== "string" || videoId.trim() === "") {
    throw new Error(
      `Observation needs a string videoId (got ${JSON.stringify(videoId)}) — ` +
        "TikTok ids exceed Number precision, so numbers cannot key a record",
    );
  }

  const now = opts.now || new Date();
  const recordedAt = raw.recordedAt ? toIso(raw.recordedAt, "recordedAt") : now.toISOString();

  const rec = {
    videoId: videoId.trim(),
    videoTitle: typeof raw.videoTitle === "string" ? raw.videoTitle : "",
    publishedAt: typeof raw.publishedAt === "string" ? raw.publishedAt : "",
    hashtags: Array.isArray(raw.hashtags) ? [...raw.hashtags] : [],
    views: null,
    likes: null,
    comments: null,
    searchQueries: Array.isArray(raw.searchQueries) ? [...raw.searchQueries] : [],
    fypPercent: null,
    searchPercent: null,
    avgWatchTimeSec: null,
    watchedFullVideoPct: null,
    recordedAt,
    source: typeof raw.source === "string" && raw.source ? raw.source : "manual",
  };
  for (const field of METRIC_FIELDS) {
    rec[field] = toNumber(raw[field], field);
  }
  return rec;
}

// ─── Merge helpers ───

const tagSet = (tags) => [...(tags || [])].sort().join("|");

const isBlank = (v) => v === null || v === undefined || v === "";

/** `recordedAt` as epoch ms; unparsable values sort oldest. */
function stamp(record) {
  const t = new Date(record?.recordedAt ?? 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function fillBlanks(target, source) {
  for (const field of [...METRIC_FIELDS, ...IDENTITY_FIELDS]) {
    if (isBlank(target[field]) && !isBlank(source[field])) target[field] = source[field];
  }
}

function unionList(target, source, field) {
  const merged = [...(target[field] || [])];
  for (const v of source[field] || []) {
    if (!merged.includes(v)) merged.push(v);
  }
  target[field] = merged;
}

function addSource(record, observation) {
  const list = [...(record.sources || [])];
  const entry = `${observation.recordedAt} ${observation.source}`;
  // Compare on (parsed time, source) so a legacy "…T00:00:00Z" entry and a
  // normalized "…T00:00:00.000Z" one are recognized as the same snapshot.
  const key = `${stamp({ recordedAt: observation.recordedAt })} ${observation.source}`;
  const already = list.some((s) => {
    const idx = s.indexOf(" ");
    if (idx < 0) return false;
    return `${stamp({ recordedAt: s.slice(0, idx) })} ${s.slice(idx + 1)}` === key;
  });
  if (!already) list.push(entry);
  record.sources = list;
}

function recordHashtagChange(record, observation) {
  // An observation without tags carries no information about them (the
  // per-video details file has none) — that must never read as "no tags".
  if (!observation.hashtags || observation.hashtags.length === 0) return;
  if (tagSet(record.hashtags) === tagSet(observation.hashtags)) return;
  const history = [...(record.hashtagHistory || [])];
  const superseded = {
    recordedAt: record.recordedAt,
    source: record.source,
    hashtags: [...(record.hashtags || [])],
  };
  if (!history.some((h) => tagSet(h.hashtags) === tagSet(superseded.hashtags))) {
    history.push(superseded);
  }
  record.hashtagHistory = history;
  record.hashtags = [...(observation.hashtags || [])];
}

// ─── Upsert ───

/**
 * Merge observations into an existing tracker record set.
 *
 * Same-key merges never append a second row, never let a null wipe a known
 * value, and never roll a fresher measurement back to an older one. Identity
 * fields take the most informative value (the longest title), so a truncated
 * caption prefix cannot become the record's name.
 *
 * @param {Array<object>} existing - parsed tracker records (any vintage)
 * @param {Array<object>} observations - raw or normalized observations
 * @returns {{records: Array<object>, added: number, updated: number, unchanged: number, legacy: number}}
 */
export function upsertRecords(existing, observations) {
  const records = existing.map((r) => ({ ...r }));
  const byKey = new Map();
  let legacy = 0;

  for (const record of records) {
    if (typeof record.videoId === "string" && record.videoId) {
      byKey.set(record.videoId, record);
    } else {
      // Pre-videoId history: no safe key, never merged, never dropped.
      legacy++;
    }
  }

  let added = 0;
  let updated = 0;
  let unchanged = 0;

  // Normalize here rather than trusting callers: a half-populated observation
  // would merge as a pile of undefined fields and make re-runs non-idempotent.
  const normalized = observations.map((o) => normalizeObservation(o));

  for (const observation of normalized) {
    const current = byKey.get(observation.videoId);

    if (!current) {
      const fresh = { ...observation };
      fresh.sources = [`${observation.recordedAt} ${observation.source}`];
      records.push(fresh);
      byKey.set(fresh.videoId, fresh);
      added++;
      continue;
    }

    const incomingNewer = stamp(observation) > stamp(current);
    const sameStamp = stamp(observation) === stamp(current);
    const before = JSON.stringify(current);

    if (incomingNewer) {
      // Freshest snapshot owns the metrics; nulls never erase known values.
      const merged = { ...current };
      for (const field of METRIC_FIELDS) {
        if (!isBlank(observation[field])) merged[field] = observation[field];
      }
      for (const field of IDENTITY_FIELDS) {
        const candidate = observation[field];
        if (!isBlank(candidate) && String(candidate).length > String(merged[field] ?? "").length) {
          merged[field] = candidate;
        }
      }
      merged.recordedAt = observation.recordedAt;
      merged.source = observation.source;
      Object.assign(current, merged);
      // Hashtags follow freshness too: the live caption is the newest truth,
      // and a superseded set is kept as history rather than discarded.
      recordHashtagChange(current, observation);
    } else {
      // Same snapshot re-run, or an older import arriving late: fill blanks
      // only — a re-run is a no-op and a stale snapshot never rolls back.
      fillBlanks(current, observation);
      if ((current.hashtags || []).length === 0 && (observation.hashtags || []).length > 0) {
        current.hashtags = [...observation.hashtags];
      }
    }

    unionList(current, observation, "searchQueries");
    addSource(current, observation);

    // Change detection is the merged result, not the branch taken: re-running
    // an identical observation must leave the record byte-identical.
    if (JSON.stringify(current) !== before) updated++;
    else unchanged++;
  }

  records.sort(
    (a, b) => stamp(b) - stamp(a) || String(a.videoId ?? "").localeCompare(String(b.videoId ?? "")),
  );

  return { records, added, updated, unchanged, legacy };
}

// ─── Adapters ───

/**
 * Map a `tiktok-video-details-*.json` file onto tracker observations.
 *
 * This is the shape `tiktok-video-details.mjs --fetch` already writes, so a
 * cycle can feed its output straight into the tracker without hand-copying.
 *
 * @param {{fetchedAt: string, videos: Array<object>}} details
 * @returns {Array<object>} normalized observations
 */
export function mapDetailsToObservations(details) {
  const fetchedAt = details?.fetchedAt || new Date().toISOString();
  const videos = Array.isArray(details?.videos) ? details.videos : [];
  return videos.map((v) =>
    normalizeObservation({
      videoId: String(v.videoId),
      videoTitle: v.title || "",
      publishedAt: v.postedOn || "",
      views: v.videoViews,
      avgWatchTimeSec: v.avgWatchTimeSec,
      watchedFullVideoPct: v.watchedFullVideoPct,
      fypPercent: v.trafficSource?.forYouPct ?? null,
      searchPercent: v.trafficSource?.searchPct ?? null,
      recordedAt: fetchedAt,
      source: "studio-analytics-detail",
    }),
  );
}
