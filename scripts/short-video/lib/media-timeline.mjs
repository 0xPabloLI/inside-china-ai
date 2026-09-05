/**
 * Deterministic media timeline fusion (#99, P6).
 *
 * Fuses P4 visual analysis windows (#69) and P5 ASR segments (#98) into a
 * versioned, deterministic timeline artifact (`video-timeline.json` shape)
 * for downstream editing/evidence-replay consumers. Pure JavaScript —
 * no LLM, no I/O required; identical inputs always produce an identical
 * artifact (byte-stable JSON, no timestamps; all ordering uses code-unit
 * string compares — localeCompare is environment-dependent).
 *
 * Fusion rules (deterministic):
 *   1. Windows and segments are clamped into [0, mediaMeta.durationMs];
 *      empty/degenerate intervals after clamping are dropped.
 *   2. A boundary sweep over all interval edges builds atomic intervals;
 *      each atomic interval inherits the windows/segments covering it.
 *   3. Adjacent atomic intervals with identical membership merge.
 *   4. Cross-modal overlap rule: co-membership of a window and a segment
 *      within one atomic interval. Intervals shorter than minEventMs with
 *      changed membership are boundary jitter — they are absorbed into the
 *      previous event (or the next when leading) with evidence unioned in,
 *      so jitter cannot fragment the timeline.
 *   5. A fused event carries both modalities; single-modality events are
 *      preserved (never dropped for lacking the other modality).
 *
 * Evidence references: events cite the input `id`s verbatim, and fused
 * segments ride their `text` on the event for audit ("哪段对白"), so every
 * event traces back to its P4 windows and P5 segments (issue acceptance).
 *
 * @module media-timeline
 */

export const TIMELINE_VERSION = "v1-2026-09-05";

const DEFAULT_MIN_EVENT_MS = 200;

/**
 * Fuse visual windows and ASR segments into a deterministic timeline.
 *
 * @param {{visualWindows: Array<{id: string, startMs: number, endMs: number,
 *            sourceMode?: ?string, confidence?: ?number}>,
 *           asrSegments: Array<{id: string, startMs: number, endMs: number,
 *            text?: string, language?: ?string}>,
 *           mediaMeta: {durationMs: number}}} input
 * @param {{minEventMs?: number}} [opts]
 * @returns {object} timeline artifact (JSON-stable: no timestamps, sorted)
 */
export function fuseMediaTimeline(input, opts = {}) {
  const minEventMs = Math.max(0, Math.round(opts.minEventMs ?? DEFAULT_MIN_EVENT_MS));
  const durationMs = Math.round(input.mediaMeta.durationMs);

  const windows = normalizeIntervals(input.visualWindows, durationMs);
  const segments = normalizeIntervals(input.asrSegments, durationMs);

  // ── Boundary sweep → atomic intervals with membership ──
  const boundaries = collectBoundaries(windows, segments, durationMs);
  const atomic = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const startMs = boundaries[i];
    const endMs = boundaries[i + 1];
    atomic.push({
      startMs,
      endMs,
      visual: windows.filter((w) => covers(w, startMs, endMs)).map((w) => w.id),
      transcript: segments.filter((s) => covers(s, startMs, endMs)).map((s) => s.id),
    });
  }

  // ── Merge identical memberships; absorb sub-threshold slivers ──
  // Atomic intervals with no evidence on either side (e.g. the media tail)
  // carry nothing to trace back to — they are not events.
  const events = [];
  for (const slice of atomic.filter((a) => a.visual.length > 0 || a.transcript.length > 0)) {
    const prev = events[events.length - 1];
    if (prev && sameMembership(prev, slice)) {
      prev.endMs = slice.endMs;
      continue;
    }
    if (prev && slice.endMs - slice.startMs < minEventMs) {
      // Sliver with changed membership — absorb into the previous event so
      // boundary jitter cannot fragment the timeline. Membership is the
      // union of both sides (absorbed evidence is preserved, never dropped).
      prev.endMs = slice.endMs;
      prev.visual = unionSorted(prev.visual, slice.visual);
      prev.transcript = unionSorted(prev.transcript, slice.transcript);
      continue;
    }
    events.push({
      startMs: slice.startMs,
      endMs: slice.endMs,
      visual: slice.visual,
      transcript: slice.transcript,
    });
  }
  // Leading sliver (no previous event to absorb into): merge into the next
  // event when it starts where the sliver ends.
  if (events.length >= 2 && events[0].endMs - events[0].startMs < minEventMs) {
    const [lead, next] = events;
    if (next.startMs === lead.endMs) {
      next.startMs = lead.startMs;
      next.visual = unionSorted(lead.visual, next.visual);
      next.transcript = unionSorted(lead.transcript, next.transcript);
      events.shift();
    }
  }

  const segmentsById = new Map(segments.map((s) => [s.id, s]));

  const timelineEvents = events.map((e) => {
    const visualEvidence = e.visual;
    const transcriptEvidence = e.transcript;
    const sourceModes = [
      ...new Set(
        windows
          .filter((w) => visualEvidence.includes(w.id) && w.sourceMode)
          .map((w) => w.sourceMode),
      ),
    ];
    // Audit surface (issue 背景: 哪段对白) — segment text rides on the event.
    const transcripts = transcriptEvidence.map((id) => {
      const seg = segmentsById.get(id);
      return { id, text: seg?.text ?? "", language: seg?.language ?? null };
    });
    const confidences = [...windows, ...segments]
      .filter(
        (r) =>
          (visualEvidence.includes(r.id) || transcriptEvidence.includes(r.id)) &&
          typeof r.confidence === "number",
      )
      .map((r) => r.confidence);
    return {
      startMs: e.startMs,
      endMs: e.endMs,
      fused: visualEvidence.length > 0 && transcriptEvidence.length > 0,
      visualEvidence,
      transcriptEvidence,
      transcripts,
      sourceMode: sourceModes.length > 0 ? sourceModes.sort(cmpId).join("+") : null,
      confidence: confidences.length > 0 ? Math.min(...confidences) : null,
    };
  });

  return {
    version: TIMELINE_VERSION,
    meta: {
      mediaDurationMs: durationMs,
      eventCount: timelineEvents.length,
      visualWindowCount: windows.length,
      asrSegmentCount: segments.length,
      minEventMs,
    },
    events: timelineEvents,
  };
}

// ─── Internals (deterministic, pure) ───

function normalizeIntervals(records, durationMs) {
  const normalized = [];
  for (const r of records || []) {
    const startMs = Math.max(0, Math.round(r.startMs));
    const endMs = Math.min(durationMs, Math.round(r.endMs));
    if (endMs - startMs <= 0) continue; // degenerate after clamping
    normalized.push({
      id: r.id,
      startMs,
      endMs,
      sourceMode: r.sourceMode ?? null,
      confidence: typeof r.confidence === "number" ? r.confidence : undefined,
      text: r.text ?? undefined,
      language: r.language ?? undefined,
    });
  }
  // Sort by (start, end, id) so downstream behaviour is input-order
  // independent. Code-unit compare keeps byte-stability across environments.
  return normalized.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || cmpId(a.id, b.id));
}

function collectBoundaries(windows, segments, durationMs) {
  const points = new Set([0, durationMs]);
  for (const r of [...windows, ...segments]) {
    points.add(r.startMs);
    points.add(r.endMs);
  }
  return [...points].sort((a, b) => a - b);
}

function covers(record, startMs, endMs) {
  return record.startMs < endMs && record.endMs > startMs;
}

function sameMembership(a, b) {
  return (
    a.visual.length === b.visual.length &&
    a.transcript.length === b.transcript.length &&
    a.visual.every((id) => b.visual.includes(id)) &&
    a.transcript.every((id) => b.transcript.includes(id))
  );
}

function cmpId(a, b) {
  a = String(a);
  b = String(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

function unionSorted(a, b) {
  return [...new Set([...a, ...b])].sort(cmpId);
}
