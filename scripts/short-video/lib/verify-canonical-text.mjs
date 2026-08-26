/**
 * Canonical Text Verification — Gate 1 of the Subtitle AIL Gate.
 *
 * Verifies that subtitle-timing.json's word sequence matches the CURRENT
 * scene-data voiceover (normalized). If scene-data was changed but timing
 * was not regenerated, this check catches the mismatch before rendering.
 *
 * Normalization: punctuation stripping + case folding + proper-noun greedy merge.
 *
 * @module verify-canonical-text
 */

// ─── Normalize ───

/**
 * Normalize a single token: strip punctuation, fold to lowercase.
 * Preserves hyphens (for names like "zhao-qi").
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[.,!?;:"`()\[\]{}]/g, "")
    .replace(/['\u2019]s\b/g, "") // possessive: ByteDance's → bytedance
    .replace(/['\u2019]ll\b/g, "ll") // contractions: don't → dont, I'll → ill
    .replace(/['\u2019]re\b/g, "re") // you're → youare → actually just youare
    .replace(/['\u2019]ve\b/g, "ve") // could've → couldve
    .replace(/['\u2019]d\b/g, "d") // I'd → id
    .replace(/['\u2019]m\b/g, "m") // I'm → im
    .replace(/['\u2019]t\b/g, "t") // don't → dont (apostrophe removed, t stays)
    .replace(/['\u2019]/g, "") // any remaining apostrophes
    .trim();
}

// ─── Proper Noun Dictionary ───

/**
 * Build a dictionary of proper nouns from meta.keyEntities.
 *
 * The dictionary maps each proper-noun phrase to its canonical form.
 * Used by greedyMerge() to reassemble split tokens in timing data.
 *
 * @param {object} keyEntities - meta.keyEntities from scene-data
 * @param {string[]} [keyEntities.companies]
 * @param {string[]} [keyEntities.people]
 * @param {string[]} [keyEntities.models]
 * @returns {Set<string>} set of lowercased proper-noun phrases
 */
export function buildProperNounDictionary(keyEntities) {
  const dict = new Set();
  if (!keyEntities) return dict;
  for (const category of Object.values(keyEntities)) {
    if (!Array.isArray(category)) continue;
    for (const name of category) {
      if (typeof name === "string" && name.length > 0) {
        dict.add(name.toLowerCase());
      }
    }
  }
  return dict;
}

// ─── Greedy Merge ───

/**
 * Greedily merge adjacent tokens that form a known proper noun.
 *
 * Example: ["byte", "dance"] + dict{bytedance} → ["bytedance"]
 * Example: ["doubao", "work"] + dict{doubao-work} → ["doubao-work"]
 *
 * Tries the longest match first (greedy), then shorter ones.
 *
 * @param {string[]} tokens — lowercased, punctuation-stripped tokens
 * @param {Set<string>} dict — proper-noun phrases
 * @returns {string[]} merged tokens
 */
export function greedyMerge(tokens, dict) {
  if (!tokens || tokens.length === 0 || dict.size === 0) return tokens || [];

  const result = [];
  let i = 0;

  while (i < tokens.length) {
    // Try longest match first: join up to 4 consecutive tokens
    let matched = false;
    for (let len = Math.min(4, tokens.length - i); len >= 2; len--) {
      const candidate = tokens.slice(i, i + len).join(" ");
      // Check if the joined form (with hyphens or spaces) is in dict
      // Also try with hyphen joining
      const hyphenated = tokens.slice(i, i + len).join("-");
      const joined = tokens.slice(i, i + len).join("");
      if (dict.has(candidate) || dict.has(hyphenated) || dict.has(joined)) {
        // Use the form that matched
        const matchedForm = dict.has(candidate)
          ? candidate
          : dict.has(hyphenated)
            ? hyphenated
            : joined;
        result.push(matchedForm);
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      result.push(tokens[i]);
      i++;
    }
  }

  return result;
}

// ─── Verify Canonical Text ───

/**
 * Normalize timing JSON data: accepts both old array format and new {scenes:[]} format.
 * Returns the scenes array.
 */
function getTimingScenes(timingData) {
  if (Array.isArray(timingData)) return timingData;
  return (timingData && timingData.scenes) || [];
}

/**
 * Extract and normalize word tokens from timing data for a given scene.
 * Applies greedy merge for proper nouns.
 *
 * @param {object} scene - timing scene object with segments
 * @param {Set<string>} dict - proper-noun dictionary
 * @returns {string[]} normalized tokens
 */
function extractTimingTokens(scene, dict) {
  const rawWords = (scene.segments || [])
    .flatMap((seg) => (seg.words || []).map((w) => w.text))
    .map(normalizeText)
    .filter((w) => w.length > 0);

  return greedyMerge(rawWords, dict);
}

/**
 * Extract and normalize word tokens from scene-data voiceover.
 * Applies greedy merge for proper nouns.
 *
 * @param {string} voiceover - scene-data voiceover text
 * @param {Set<string>} dict - proper-noun dictionary
 * @returns {string[]} normalized tokens
 */
function extractVoiceoverTokens(voiceover, dict) {
  if (!voiceover || voiceover.trim().length === 0) return [];
  const rawWords = voiceover
    .split(/\s+/)
    .map(normalizeText)
    .filter((w) => w.length > 0);

  return greedyMerge(rawWords, dict);
}

/**
 * Verify that timing JSON's word sequence matches scene-data voiceover.
 *
 * This is Gate 1 of the Subtitle AIL Gate — runs before rendering to catch
 * stale timing (scene-data changed but text-align.py not re-run).
 *
 * @param {Array|object} timingData - subtitle-timing.json (old array or new {scenes:[]} format)
 * @param {Array<{id: number, voiceover: string}>} scenes - scene-data scenes
 * @param {object} keyEntities - meta.keyEntities for proper-noun dictionary
 * @returns {{passed: boolean, mismatches: Array<{sceneId: number, reason: string, timing: string[], voiceover: string[]}>}}
 */
export function verifyCanonicalText(timingData, scenes, keyEntities) {
  const dict = buildProperNounDictionary(keyEntities);
  const timingScenes = getTimingScenes(timingData);
  const mismatches = [];

  // Build scene-id → voiceover map from scene-data
  const voiceoverMap = new Map();
  for (const scene of scenes || []) {
    voiceoverMap.set(scene.id, scene.voiceover || "");
  }

  for (const timingScene of timingScenes) {
    const sceneId = timingScene.sceneId;
    const voiceover = voiceoverMap.get(sceneId) ?? "";
    const voTokens = extractVoiceoverTokens(voiceover, dict);

    // Skip scenes with empty voiceover (visual-only scenes)
    if (voTokens.length === 0) continue;

    const timingTokens = extractTimingTokens(timingScene, dict);

    // Scenario 15: voiceover non-empty but timing has 0 words
    if (timingTokens.length === 0) {
      mismatches.push({
        sceneId,
        reason: "voiceover has words but timing has 0 words",
        timing: timingTokens,
        voiceover: voTokens,
      });
      continue;
    }

    // 100% match required
    if (JSON.stringify(timingTokens) !== JSON.stringify(voTokens)) {
      // Find first mismatch for detail
      let firstDiff = null;
      const limit = Math.max(timingTokens.length, voTokens.length);
      for (let i = 0; i < limit; i++) {
        if (timingTokens[i] !== voTokens[i]) {
          firstDiff = { index: i, timing: timingTokens[i], voiceover: voTokens[i] };
          break;
        }
      }
      mismatches.push({
        sceneId,
        reason: firstDiff
          ? `word ${firstDiff.index}: timing="${firstDiff.timing}" vs voiceover="${firstDiff.voiceover}"`
          : `length mismatch (timing=${timingTokens.length} vs voiceover=${voTokens.length})`,
        timing: timingTokens,
        voiceover: voTokens,
      });
    }
  }

  return {
    passed: mismatches.length === 0,
    mismatches,
  };
}

// ─── Gate 1 Runner ───

/**
 * Run Gate 1 (Canonical Text verification) as a pipeline step.
 *
 * Calls verifyCanonicalText and either passes through (PASS) or
 * hard-fails with process.exit(1) + diagnostic output (FAIL).
 *
 * @param {Array|object} timingData - subtitle-timing.json
 * @param {Array<{id: number, voiceover: string}>} scenes - scene-data scenes
 * @param {object} keyEntities - meta.keyEntities
 * @param {object} [options]
 * @param {string} [options.label="Canonical Text"] - label for log output
 * @param {boolean} [options.renderOnly=false] - if true, hint about running full pipeline
 * @returns {{passed: boolean, mismatches: Array}} result (only returns on PASS; FAIL exits)
 */
export function runCanonicalTextGate(timingData, scenes, keyEntities, options = {}) {
  const { label = "Canonical Text", renderOnly = false } = options;

  if (!timingData) {
    console.log(`  ⏭️  ${label}: skipped (no timing data)`);
    return { passed: true, mismatches: [] };
  }

  const result = verifyCanonicalText(timingData, scenes, keyEntities);

  if (result.passed) {
    console.log(`  ✅ ${label}: PASS (canonical text matches scene-data)`);
    return result;
  }

  // FAIL — hard exit
  console.error(`  ❌ ${label}: FAIL (canonical text mismatch)`);
  for (const m of result.mismatches) {
    console.error(`     Scene ${m.sceneId}: ${m.reason}`);
  }

  if (renderOnly) {
    console.error(`\n  ⛔ Scene-data voiceover has changed but subtitle-timing.json is stale.`);
    console.error(`     Run full pipeline: node main.mjs --content <slug>\n`);
  } else {
    console.error(`\n  ⛔ Canonical text mismatch detected. Scene-data voiceover has changed.`);
    console.error(`     The timing needs to be regenerated (text-align.py).\n`);
  }

  process.exit(1);
}

// ─── Gate 1 Runner with Repair (T5) ───

/**
 * Run Gate 1 with one repair attempt: if canonical-text fails, re-run
 * text-align.py to regenerate timing, then re-verify.
 *
 * The repair function is injected (dependency injection) to avoid
 * circular imports between verify-canonical-text and tts/post-process.
 *
 * @param {Array|object} timingData - subtitle-timing.json
 * @param {Array<{id: number, voiceover: string}>} scenes - scene-data scenes
 * @param {object} keyEntities - meta.keyEntities
 * @param {object} options
 * @param {string} [options.label="Gate 1"] - label for log output
 * @param {boolean} [options.renderOnly=false] - hint about running full pipeline
 * @param {Function} [options.realignFn] - async () => newTimingData — re-runs text-align.py
 * @param {Function} [options.reloadTimingFn] - () => timingData — re-reads timing JSON from disk
 * @returns {Promise<{passed: boolean, mismatches: Array, timingData: (Array|object)}>}
 */
export async function runCanonicalTextGateWithRepair(
  timingData,
  scenes,
  keyEntities,
  options = {},
) {
  const { label = "Gate 1", renderOnly = false, realignFn = null, reloadTimingFn = null } = options;

  if (!timingData) {
    console.log(`  ⏭️  ${label}: skipped (no timing data)`);
    return { passed: true, mismatches: [], timingData };
  }

  // First check
  let result = verifyCanonicalText(timingData, scenes, keyEntities);

  if (result.passed) {
    console.log(`  ✅ ${label}: PASS (canonical text matches scene-data)`);
    return { ...result, timingData };
  }

  // FAIL — attempt repair if realignFn is available
  if (!realignFn || !reloadTimingFn) {
    return runCanonicalTextGate(timingData, scenes, keyEntities, { label, renderOnly });
  }

  console.log(`  ⚠️  ${label}: FAIL — attempting repair (re-run text-align.py)...`);
  for (const m of result.mismatches) {
    console.log(`     Scene ${m.sceneId}: ${m.reason}`);
  }

  try {
    await realignFn();
  } catch (e) {
    console.error(`  ❌ ${label}: repair failed — ${e.message}`);
    return runCanonicalTextGate(timingData, scenes, keyEntities, { label, renderOnly });
  }

  // Re-read timing data from disk (text-align.py updated the file)
  const newTimingData = reloadTimingFn();
  result = verifyCanonicalText(newTimingData, scenes, keyEntities);

  if (result.passed) {
    console.log(`  ✅ ${label}: PASS after repair (canonical text now matches)`);
    return { ...result, timingData: newTimingData };
  }

  // Still fails after repair — hard exit
  console.error(`  ❌ ${label}: FAIL after repair (canonical text still mismatches)`);
  for (const m of result.mismatches) {
    console.error(`     Scene ${m.sceneId}: ${m.reason}`);
  }
  console.error(`\n  ⛔ Canonical text mismatch persists after re-running text-align.py.`);
  console.error(`     Scene-data voiceover may not match the TTS audio.`);
  if (renderOnly) {
    console.error(`     Run full pipeline: node main.mjs --content <slug>`);
  } else {
    console.error(`     Try re-running TTS: node main.mjs --content <slug>`);
  }
  console.error("");

  process.exit(1);
}
