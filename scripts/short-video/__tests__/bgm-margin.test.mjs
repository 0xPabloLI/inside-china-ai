/**
 * Music-under-voice margin (#950).
 *
 * The defect this guards: the platform slider read −20 dB while the shipped
 * mix measured −22.2 dB below the narration, and every existing gate was green
 * because whole-mix LUFS cannot see a relative level. These tests pin the two
 * halves — window derivation (where speech is, where only the bed can be) and
 * the verdict thresholds — plus an end-to-end pass over synthesized files whose
 * margin is known by construction.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "fs";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import {
  BGM_BED_FLOOR_DBFS,
  BGM_MARGIN_PASS_MAX_DB,
  BGM_MARGIN_PASS_MIN_DB,
  BGM_MARGIN_WARN_MAX_DB,
  BGM_MARGIN_WARN_MIN_DB,
  buildWindowsFromTiming,
  detectSilenceWindows,
  evaluateBgmMargin,
  measureBgmMargin,
  measureWindowLevels,
  readBgmMixMarker,
  writeBgmMixMarker,
} from "../lib/audio/bgm-margin.mjs";
import { hasFfmpeg } from "./fixtures/metachar-path.mjs";

const NO_GUARDS = { headGuardSeconds: 0, tailGuardSeconds: 0 };

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

describe("buildWindowsFromTiming", () => {
  // Two scenes. Scene 1's clip is ceil((2.0+0.5)*30)/30 = 2.5s, so scene 2
  // starts at 2.5s; its own clip is 3.0s (total 5.5s). Words leave a 0.066s
  // gap inside scene 1 (below the pause floor) and a 0.5s buffer between
  // scenes (above it).
  const timing = [
    {
      sceneId: 1,
      segments: [
        { start: 0.1, end: 1.0, words: [] },
        { start: 1.066, end: 2.0, words: [] },
      ],
    },
    { sceneId: 2, segments: [{ start: 0.2, end: 2.5, words: [] }] },
  ];
  const durations = [
    { sceneId: 1, duration: 2.0 },
    { sceneId: 2, duration: 2.5 },
  ];

  it("offsets scene-local speech onto the global timeline", () => {
    const { speech } = buildWindowsFromTiming(timing, durations, NO_GUARDS);
    expect(speech).toEqual([
      [0.1, 1.0],
      [1.066, 2.0],
      [2.7, 5.0],
    ]);
  });

  it("clamps alignment overshoot to the scene's own voice span", () => {
    // Same clamp as cues.mjs / verify-subtitles.mjs: a segment that ends past
    // ttsDuration must not bleed into the inter-scene buffer, or it would eat
    // the bed-only window the measurement depends on.
    const overshoot = [
      {
        sceneId: 1,
        segments: [
          { start: 0.1, end: 1.0, words: [] },
          { start: 1.066, end: 2.4, words: [] }, // 0.4s past scene 1's 2.0s voice
        ],
      },
      { sceneId: 2, segments: [{ start: 0.2, end: 2.5, words: [] }] },
    ];
    const { speech } = buildWindowsFromTiming(overshoot, durations, NO_GUARDS);
    expect(speech[1]).toEqual([1.066, 2.0]);
  });

  it("turns the inter-scene buffer into an inset pause window", () => {
    const { pause } = buildWindowsFromTiming(timing, durations, {
      ...NO_GUARDS,
      tailGuardSeconds: 0.5, // drops the trailing gap so only the buffer remains
      pauseInsetSeconds: 0.12,
      minPauseSeconds: 0.15,
    });
    // Scene 1 ends at 2.5; scene 2's first word starts at 2.5 + 0.2 = 2.7.
    expect(pause).toHaveLength(1);
    expect(pause[0][0]).toBeCloseTo(2.0 + 0.12, 5);
    expect(pause[0][1]).toBeCloseTo(2.7 - 0.12, 5);
  });

  it("drops gaps shorter than the pause floor", () => {
    const { pause } = buildWindowsFromTiming(timing, durations, {
      ...NO_GUARDS,
      pauseInsetSeconds: 0.12,
      minPauseSeconds: 0.15,
    });
    // The 0.066s gap inside scene 1 never becomes a window.
    for (const [start] of pause) expect(start).toBeGreaterThan(1.5);
  });

  it("excludes the head and the BGM fade-out tail from pause windows", () => {
    const { pause, speech } = buildWindowsFromTiming(timing, durations, {
      headGuardSeconds: 0.35,
      tailGuardSeconds: 3.2,
    });
    // Everything after 5.5 − 3.2 = 2.3s is inside the fade-out region, which
    // removes the inter-scene pause. Guards apply to pauses only: the voice
    // is never faded, and dropping words would only cost coverage. (Windows
    // are still clamped to their scene's voice span — overshoot test above.)
    expect(pause).toEqual([]);
    expect(speech).toEqual([
      [0.1, 1.0],
      [1.066, 2.0],
      [2.7, 5.0],
    ]);
  });

  it("accepts the { scenes: [] } timing envelope and reports coverage", () => {
    const { speech, pause, speechSeconds, pauseSeconds, totalDuration } = buildWindowsFromTiming(
      { scenes: timing },
      durations,
      { ...NO_GUARDS, pauseInsetSeconds: 0.05, minPauseSeconds: 0.15 },
    );
    expect(speech).toHaveLength(3);
    // Inter-scene gap [2.0, 2.7] and trailing gap [5.0, 5.5]; the leading
    // 0.1s gap is shorter than the inset, so it never survives.
    expect(pause).toHaveLength(2);
    expect(speechSeconds).toBeGreaterThan(3.5);
    expect(pauseSeconds).toBeGreaterThan(0.5);
    expect(totalDuration).toBeCloseTo(5.5, 5);
  });

  it("throws a named error when a scene has no duration", () => {
    expect(() => buildWindowsFromTiming(timing, [{ sceneId: 1, duration: 2.0 }])).toThrow(
      /scene 2/i,
    );
  });
});

describe("measureWindowLevels", () => {
  const sampleRate = 8000;

  function pcmWith([speechAmp, pauseAmp]) {
    const samples = new Float32Array(sampleRate);
    for (let i = 0; i < samples.length; i++) {
      const amp = i < sampleRate / 2 ? speechAmp : pauseAmp;
      samples[i] = amp * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }
    return samples;
  }

  it("computes the margin as the difference of the two window levels", () => {
    const { speechRmsDb, bgmOnlyRmsDb, marginDb } = measureWindowLevels({
      samples: pcmWith([0.5, 0.05]),
      sampleRate,
      windows: { speech: [[0, 0.5]], pause: [[0.5, 1.0]] },
    });
    expect(speechRmsDb).toBeCloseTo(20 * Math.log10(0.5 / Math.SQRT2), 1);
    expect(bgmOnlyRmsDb).toBeCloseTo(20 * Math.log10(0.05 / Math.SQRT2), 1);
    expect(marginDb).toBeCloseTo(20, 1);
  });

  it("reports digital silence at the floor instead of -Infinity", () => {
    const { bgmOnlyRmsDb, marginDb } = measureWindowLevels({
      samples: new Float32Array(sampleRate),
      sampleRate,
      windows: { speech: [[0, 0.5]], pause: [[0.5, 1.0]] },
    });
    expect(bgmOnlyRmsDb).toBe(-120);
    expect(Number.isFinite(marginDb)).toBe(true);
  });
});

describe("evaluateBgmMargin", () => {
  const inBand = { ok: true, speechRmsDb: -16, bgmOnlyRmsDb: -36, marginDb: 20 };

  it("passes a bed inside the measured band", () => {
    expect(evaluateBgmMargin(inBand, { expectBed: true }).status).toBe("pass");
  });

  it(`passes at the band edges (${BGM_MARGIN_PASS_MIN_DB}, ${BGM_MARGIN_PASS_MAX_DB})`, () => {
    expect(
      evaluateBgmMargin({ ...inBand, marginDb: BGM_MARGIN_PASS_MIN_DB }, { expectBed: true })
        .status,
    ).toBe("pass");
    expect(
      evaluateBgmMargin({ ...inBand, marginDb: BGM_MARGIN_PASS_MAX_DB }, { expectBed: true })
        .status,
    ).toBe("pass");
  });

  it("fails when the music sits too close to the narration", () => {
    const verdict = evaluateBgmMargin({ ...inBand, marginDb: 6 }, { expectBed: true });
    expect(verdict.status).toBe("fail");
    expect(verdict.reasons.join(" ")).toMatch(/too loud/i);
  });

  it("fails when the bed is effectively gone but still measurable", () => {
    const verdict = evaluateBgmMargin(
      { ...inBand, bgmOnlyRmsDb: -45, marginDb: 40 },
      { expectBed: true },
    );
    expect(verdict.status).toBe("fail");
    expect(verdict.reasons.join(" ")).toMatch(/gone|effectively/i);
  });

  it(`fails when a local mix was expected and the bed is at/below ${BGM_BED_FLOOR_DBFS} dBFS`, () => {
    const verdict = evaluateBgmMargin(
      { ok: true, speechRmsDb: -16, bgmOnlyRmsDb: -120, marginDb: 104 },
      { expectBed: true },
    );
    expect(verdict.status).toBe("fail");
    expect(verdict.reasons.join(" ")).toMatch(/absent|missing/i);
  });

  it("keeps the warn band around the pass band", () => {
    expect(
      evaluateBgmMargin({ ...inBand, marginDb: BGM_MARGIN_WARN_MIN_DB }, { expectBed: true })
        .status,
    ).toBe("warn");
    expect(
      evaluateBgmMargin({ ...inBand, marginDb: BGM_MARGIN_WARN_MAX_DB }, { expectBed: true })
        .status,
    ).toBe("warn");
  });

  it("treats an absent bed as fine when none was expected (platform-attach path)", () => {
    const verdict = evaluateBgmMargin(
      { ok: true, speechRmsDb: -16, bgmOnlyRmsDb: -120, marginDb: 104 },
      { expectBed: false },
    );
    expect(verdict.status).toBe("pass");
    expect(verdict.reasons.join(" ")).toMatch(/no local bed|not applicable/i);
  });

  it("does not fail an older artifact with no marker and no bed", () => {
    const verdict = evaluateBgmMargin(
      { ok: true, speechRmsDb: -16, bgmOnlyRmsDb: -120, marginDb: 104 },
      { expectBed: null },
    );
    expect(verdict.status).toBe("pass");
    expect(verdict.reasons.join(" ")).toMatch(/no mix recorded/i);
  });

  it("warns when a bed appears although the render recorded none", () => {
    expect(evaluateBgmMargin(inBand, { expectBed: false }).status).toBe("warn");
  });

  it("judges in-band when the expectation is unknown", () => {
    expect(evaluateBgmMargin(inBand, { expectBed: null }).status).toBe("pass");
    expect(evaluateBgmMargin({ ...inBand, marginDb: 5 }, { expectBed: null }).status).toBe("fail");
  });

  it("returns unknown when the artifact could not be measured", () => {
    expect(evaluateBgmMargin({ ok: false, error: "no pause windows" }).status).toBe("unknown");
  });
});

describe("BGM mix marker", () => {
  it("round-trips the expectation next to the artifact", () => {
    const dir = tempDir("bgm-marker");
    try {
      const video = join(dir, "out.mp4");
      writeFileSync(video, "");
      writeBgmMixMarker(video, { bgmPath: "/pool/news-cc-theme01.mp3", volume: 0.12 });
      const marker = readBgmMixMarker(video);
      expect(marker.mixed).toBe(true);
      expect(marker.video).toBe("out.mp4");
      expect(marker.bgm).toBe("news-cc-theme01.mp3");
      expect(marker.volume).toBe(0.12);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records mixed:false when the finalize pass ran without a bed", () => {
    const dir = tempDir("bgm-marker-none");
    try {
      const video = join(dir, "out.mp4");
      writeFileSync(video, "");
      writeBgmMixMarker(video, { bgmPath: null });
      const marker = readBgmMixMarker(video);
      expect(marker.mixed).toBe(false);
      expect(marker.bgm).toBe(null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns null for a missing or unreadable marker", () => {
    const dir = tempDir("bgm-marker-missing");
    try {
      const video = join(dir, "out.mp4");
      writeFileSync(video, "");
      expect(readBgmMixMarker(video)).toBe(null);
      mkdirSync(join(dir, "audio"), { recursive: true });
      writeFileSync(join(dir, "audio", "bgm-mix.json"), "{not json");
      expect(readBgmMixMarker(video)).toBe(null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!hasFfmpeg)("end-to-end on synthesized audio", () => {
  // 12s, long enough for the 3.2s BGM fade-out guard to leave the middle
  // intact: five 1s tones separated by 0.6s, then trailing silence. Both the
  // voice and the bed are sines at different frequencies, so the bed is
  // measurable in exactly the gaps and nowhere else.
  const VOICE_AMP = 0.5;
  const TOTAL_SECONDS = 12;
  const TONES = [
    [0.5, 1.5],
    [2.1, 3.1],
    [3.7, 4.7],
    [5.3, 6.3],
    [6.9, 7.9],
  ];

  function sineExpr(amp) {
    const gate = TONES.map(([start, end]) => `between(t,${start},${end})`).join("+");
    // Single quotes are for the filtergraph parser (commas separate filters),
    // not the shell — this string reaches ffmpeg as one argv element.
    return `'if(${gate},${amp}*sin(2*PI*440*t),0)'`;
  }

  function bedExpr(amp) {
    return `${amp}*sin(2*PI*300*t)`;
  }

  function makeWav(path, expr) {
    const result = spawnSync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `aevalsrc=${expr}:s=8000:d=${TOTAL_SECONDS}`,
      "-c:a",
      "pcm_s16le",
      path,
    ]);
    expect(result.status).toBe(0);
  }

  function mixVoiceAndBed(voice, bed, out) {
    const result = spawnSync("ffmpeg", [
      "-y",
      "-i",
      voice,
      "-i",
      bed,
      "-filter_complex",
      "[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=0[a]",
      "-map",
      "[a]",
      "-c:a",
      "pcm_s16le",
      out,
    ]);
    expect(result.status).toBe(0);
  }

  function fixture() {
    const dir = tempDir("bgm-margin-e2e");
    const voice = join(dir, "voice.wav");
    makeWav(voice, sineExpr(VOICE_AMP));
    return { dir, voice };
  }

  it("finds the pauses by silence detection on the voice-only track", () => {
    const { dir, voice } = fixture();
    try {
      const windows = detectSilenceWindows(voice);
      expect(windows.pause.length).toBeGreaterThanOrEqual(2);
      expect(windows.speech.length).toBeGreaterThanOrEqual(3);
      for (const [start, end] of windows.speech) {
        const mid = (start + end) / 2;
        expect(TONES.some(([s, e]) => mid > s && mid < e)).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("measures a ~20 dB bed as PASS and passes the out-of-band cases to FAIL", () => {
    const { dir, voice } = fixture();
    try {
      const windows = detectSilenceWindows(voice);

      const inBandBed = join(dir, "bed-20db.wav");
      makeWav(inBandBed, bedExpr(VOICE_AMP * 0.1));
      const inBandMix = join(dir, "mixed-20db.wav");
      mixVoiceAndBed(voice, inBandBed, inBandMix);
      const inBand = measureBgmMargin({ videoPath: inBandMix, windows });
      expect(inBand.ok).toBe(true);
      expect(inBand.marginDb).toBeGreaterThan(18);
      expect(inBand.marginDb).toBeLessThan(22);
      expect(evaluateBgmMargin(inBand, { expectBed: true }).status).toBe("pass");

      const loudBed = join(dir, "bed-0db.wav");
      makeWav(loudBed, bedExpr(VOICE_AMP));
      const loudMix = join(dir, "mixed-0db.wav");
      mixVoiceAndBed(voice, loudBed, loudMix);
      const tooLoud = measureBgmMargin({ videoPath: loudMix, windows });
      expect(tooLoud.marginDb).toBeLessThan(10);
      expect(evaluateBgmMargin(tooLoud, { expectBed: true }).status).toBe("fail");

      const buriedBed = join(dir, "bed-60db.wav");
      makeWav(buriedBed, bedExpr(VOICE_AMP * 0.001));
      const buriedMix = join(dir, "mixed-60db.wav");
      mixVoiceAndBed(voice, buriedBed, buriedMix);
      const buried = measureBgmMargin({ videoPath: buriedMix, windows });
      expect(buried.bgmOnlyRmsDb).toBeLessThanOrEqual(BGM_BED_FLOOR_DBFS);
      expect(evaluateBgmMargin(buried, { expectBed: true }).status).toBe("fail");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports the voice-only render as no-local-bed", () => {
    const { dir, voice } = fixture();
    try {
      const windows = detectSilenceWindows(voice);
      const measurement = measureBgmMargin({ videoPath: voice, windows });
      expect(measurement.ok).toBe(true);
      expect(measurement.bgmOnlyRmsDb).toBeLessThanOrEqual(BGM_BED_FLOOR_DBFS);
      expect(evaluateBgmMargin(measurement, { expectBed: false }).status).toBe("pass");
      expect(evaluateBgmMargin(measurement, { expectBed: true }).status).toBe("fail");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes the marker next to the video, not in the cwd", () => {
    const { dir } = fixture();
    try {
      const video = join(dir, "rendered.mp4");
      writeFileSync(video, "");
      writeBgmMixMarker(video, { bgmPath: "news-cc-theme01.mp3", volume: 0.12 });
      const raw = JSON.parse(readFileSync(join(dir, "audio", "bgm-mix.json"), "utf8"));
      expect(raw.video).toBe("rendered.mp4");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
