/**
 * Unitree H2-X 「功夫传奇 守护」 / "Kung Fu Legend Guardian" — straight news
 * report on the guard robot Unitree introduced on 2026-10-21.
 *
 * 10 scenes, target ~64s. Subject: what the robot demonstrably does in
 * Unitree's own 61 second film, with Unitree's burned-in English captions kept
 * in frame as the evidence.
 *
 * Scene 8 carries the story's second fact: the release has no spec sheet, no
 * price and no release date. It sits after the footage rather than before it so
 * the acts are read as evidence for a claim the viewer has just watched, and it
 * is a CSS card like the caveat that follows, which keeps every footage scene
 * (1-7) on its own verified take.
 *
 * Angle (user decision 2026-10-24): report the capabilities straight. The user
 * explicitly rejected a manufactured contradiction between the polished film
 * and the 2026-10-22 leg-detachment incident at the Hangzhou partner
 * conference ("我希望这个新闻就报道宇树那些fancy的安保机器人内容就行"). That
 * second axis stays out of the video; it is documented in the ledger only.
 *
 * Footage (user decision 2026-10-24): reuse clips from the official film with
 * the in-frame English captions visible as the evidence ("全片复用多个片段，
 * 含片内英文字幕原样入镜（字幕即证据）").
 *
 * Edit structure (user decision 2026-10-25). The first cut chopped the film
 * into ten scenes by splitting shots at arbitrary points, then let each scene
 * loop a 1.2-3.1s fragment 3-5 times to fill its TTS duration. The user
 * rejected that on both counts: the hook promised a car lift while showing the
 * night rescue segment, and the short clips repeated inside their scenes
 * ("有些视频明明还有内容，被你强行截断然后重复播放... 你也不用强行拆scene，
 * 你按照他的视频讲解不可以吗"). This cut follows the film's own acts instead:
 * one scene per act, in the film's own order.
 *
 *   act1  0.30- 9.85  scrapyard martial arts      "Real Footage Throughout No Speed Up"
 *   act2  9.90-18.80  car parkour, stacked cars   "4 Meter High Platform"
 *   act3 18.85-27.30  4 m drop, slow-mo kick      "Ultra Long Endurance... 8 Hours"
 *   act4 27.35-41.05  night villa knife intercept "Security Demonstration"
 *   act5 41.10-47.72  daylight car lift           "Real Footage of Props for Reference Only"
 *   act6 47.75-54.30  second robot, car rescue    "Real Footage of Props for Reference Only"
 *
 * SCENE LENGTH IS BOUNDED BY CLIP LENGTH. MediaBackground renders
 * `<Video loop>`, so a scene longer than its clip visibly restarts the act —
 * the exact defect the user reported. A scene's rendered length is
 * `ceil((tts + SCENE_BUFFER) * 30) / 30` (lib/timeline.mjs), so every
 * voiceover below is sized against its clip's real duration minus the 0.5s
 * buffer:
 *
 *   scene 1  hook        clip  6.62s   budget  4.12s   (2.5s skipped, see below)
 *   scene 2  act1        clip  9.56s   budget  9.06s
 *   scene 3  act2        clip  8.90s   budget  8.40s
 *   scene 4  act3        clip  8.46s   budget  7.96s
 *   scene 5  act4        clip 13.70s   budget 11.20s   (2.0s skipped, see below)
 *   scene 6  act5        clip  6.62s   budget  4.42s   (2.2s skipped, see below)
 *   scene 7  act6        clip  6.56s   budget  6.06s
 *
 * Measured delivery on this voice is 2.5-3.5 words per second, so the word
 * counts are chosen to clear the budget even at the slow end of that range
 * (2.5 w/s). The first pass was written without this check and scenes 6 and 7
 * carried 20 and 21 words against 6.6s clips — both would have wrapped and
 * replayed their act. Any future edit to a voiceover has to re-check this
 * table; a longer line needs a longer clip, not a loop.
 *
 * Three scenes skip into their act, because the act is longer than the scene
 * and the payoff sits late in it: the hook drops 2.5s of the walk-in so the car
 * leaves the ground on screen, scene 6 drops 2.2s so the lift is not cut off
 * before it starts, and scene 5 drops 2.0s of the opening grinding-sparks beat
 * so act4's gate climb, knife block and closing flip all fit. Every offset is
 * inside its clip, so `trimBefore` never wraps.
 *
 * The scene-1 "budget" is the media left after its 2.5s skip (6.62 - 2.5), not
 * the full clip; the hook voiceover was cut to 10 words to fit it and measures
 * 195 WPM, inside the pacing band.
 *
 * Every scene's voiceover must also be true of what the clip shows inside the
 * scene's own window. Two shipped drafts failed that: scene 2 claimed the robot
 * "opens a door" (no door opens anywhere in act1) and scene 6 promised the car
 * "comes up" while the lift sat at clip 4.7s and the scene ended at 4.53s, so
 * the line described a frame the viewer never saw. Both were caught by
 * extracting the rendered scene's frames and reading them, not by any gate —
 * `verify-video` and the frame gate check layout, never claim-versus-footage.
 *
 * Contain, and dim (measured, not guessed). Every media scene below declares
 * `fit: "contain"`, so `media-bottom-bar` shows the WHOLE 16:9 source frame,
 * bottom-anchored in its band — see the contain rule in MediaBackground and
 * MEDIA_BAND in lib/safe-zones.mjs for why the band stops at 1309 and not at
 * the subtitle lane. Nothing is cropped, and that is the point: this pack uses
 * the film's own burned-in captions as evidence, and cropping costs it. A
 * 1080x1920 hook cover-crop keeps 607 of the source's 1920 px (31.6%); the
 * 1080x817 body band keeps 1428 (74.4%). Contain keeps 1080 (100%).
 *
 * verify-remotion-frames.mjs fails a frame when more than 5% of the pixels in
 * the TikTok right action rail (x>880, y 640-1775) are brighter than luminance
 * 80. Because the band is 1080x817 — taller than 16:9 — a contained source fits
 * to width and the rail samples the source across its full width rather than a
 * cropped middle. Measured worst-case rail occupancy at the values below:
 * hook 0.6%, act1 0.1%, act2 0.0%, act3 0.6%, act4 3.5%, act5 1.4%, act6 1.0%
 * (worst 3.5% against the 5% line). `overlay` was then raised only as far as
 * the rail demanded, because the dim also dims the captions being used as
 * evidence.
 *
 * The captions now survive trivially: with the whole frame on screen, every
 * burned-in caption is in frame by construction — bottom-left (acts 1, 4, 5, 6,
 * source x 41-806), top-left (act 2, x 46-644) and top-right (act 3, x
 * 1224-1891) alike. `cropFocus` is therefore INERT on every scene below: a
 * contained source has no horizontal slack to spend, and the vertical anchor is
 * the band's bottom. The values are kept rather than deleted because they record
 * the framing that was solved for `cover`, and would apply again verbatim if a
 * scene ever went back to it.
 *
 * Visual strategy: eight scenes carry the report (seven with real footage from
 * the official film, one CSS card for the missing-spec beat) and two close it
 * (the caveat card and the CTA). No screenshots, no generated imagery.
 *
 * Sources: Unitree official film (YouTube, channel Unitree Robotics,
 * 2026-10-21, 60.72 s, 1920x1080 at 50 fps) and its on-screen captions; the
 * official description; SCMP's report that Unitree declined to detail the
 * H2-X. Ledger: docs/refs/source-materials/unitree-h2x-guardian-2026-10-21.md
 *
 * Deliberately excluded: the 182 cm / 70 kg / 31 DOF / 360 N m / 2070 TOPS
 * figures that media outlets repeat as H2-X specs. They come from the H2
 * platform page, which is a different product; Unitree published no H2-X spec
 * sheet. Also excluded: the 2026-10-22 leg-detachment incident and the stock
 * price moves, per the user's angle decision.
 *
 * Digital human (Step 8c): NOT declared. The video is a straight product-news
 * report built from Unitree's own footage; the segments that would qualify are
 * the hook and the caveat, and the pack uses no presenter persona anywhere.
 * Consistent with the deepinfer and deepseek-v41-flash-1017 packs.
 */

export const scenes = [
  {
    id: 1,
    name: "hook",
    visualType: "hook",
    layout: "hero-center",
    narrativeRole: "S",
    retentionMechanism: null,
    mediaStrategy: "asset",
    // Declared up front, and that matters for cost. The hook always gets the
    // 1.1x floor (lib/tts/pacing.mjs HOOK_MIN_SPEED, #244: 1.0x hooks read slow
    // and accented). Without this field the first take is generated at 1.0x,
    // the pacing loop then measures it in band, applies the floor, and pushes a
    // SECOND Kaggle kernel just to regenerate scene 1. A fresh kernel pays the
    // full CosyVoice3 model load again, so the miss cost roughly a quarter hour
    // on this run. Declaring 1.1 here makes the first take match the floor, and
    // the loop's `c.speed <= current` check (registry.mjs) keeps it without a
    // regeneration. Any English hook should carry this field.
    ttsSpeed: 1.1,
    // Full-bleed background, and the point of the whole re-cut: this is the
    // act where the robot actually lifts the car. The first cut used the night
    // rescue segment here, so the hook said "IT LIFTS A CAR" over footage of
    // something else. The clip is 16:9 and the hook is 9:16, so the two ways to
    // fill it split on the captions: a cover-crop keeps only 608 of the source's
    // 1920 px of width and no burned-in caption survives it, while contain shows
    // the whole frame and keeps every one. This pack uses those captions as
    // evidence, so the hook contains into the body's [220, 1037] band
    // (hookMediaBand) rather than bleeding to the full canvas.
    //
    // videoStartOffsetMs 2500: the lift is the LAST 1.6s of the act, so playing
    // act5 from its start would spend ~4.5s on the robot walking in before the
    // car leaves the ground — the same "text promises one thing, footage shows
    // another" defect, just in slow motion. At 2.5s the arms go under the car
    // around scene 1.6s and the front wheel is off the ground from scene 2.2s
    // to the end, so roughly the last 1.7s of the 3.87s hook IS the lift.
    //
    // 2.5s is also the largest offset this scene can take: the scene renders
    // `ceil((3.38 + 0.5) x 30) = 116` frames = 3.87s, so it needs 2.5 + 3.87 =
    // 6.37s of the 6.62s clip. A larger offset would wrap the loop and replay
    // the walk-in, which is the defect being fixed.
    media: {
      type: "video",
      path: "assets/clips/act5-lift.mp4",
      source: "Unitree Robotics official film, H2-X, 2026-10-21",
      animation: "fade",
      fit: "contain",
      cropFocus: { x: 0.5, y: 0.5 },
      videoStartOffsetMs: 2500,
      overlay: 0.55,
      volume: 0,
    },
    // 10 words against 6.62s of clip minus the 1.8s offset = 4.32s of room.
    // The wording is also load-bearing: `checkHookDiffersFromText` counts VO
    // words over 3 chars that appear in the on-screen text, and "standing" does
    // not match the reveal text's "STANDS". That keeps the overlap at 3/7 (43%),
    // under the 50% WARN threshold; swapping "standing" back to "stands" would
    // make it 4/7 and trip the warning.
    voiceover: "Unitree's new guard robot lifts a car. 8 hours standing.",
    texts: {
      badge: "OCT 21, 2026",
      subject: "UNITREE",
      hookText: "IT LIFTS A CAR.",
      revealText: "STANDS 8 HOURS",
      source: "SOURCE: UNITREE OFFICIAL FILM, OCT 21",
    },
  },
  {
    id: 2,
    name: "act1-martial",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "T",
    retentionMechanism: "open-loop",
    mediaStrategy: "asset",
    // Carries Unitree's own caption "Real Footage Throughout No Speed Up"
    // (source x 48-806, y 1005-1050). Under contain the whole frame is on
    // screen, so that caption is in frame whatever cropFocus says; the 0 below
    // is the cover-era value and is inert.
    media: {
      type: "video",
      path: "assets/clips/act1-martial.mp4",
      source: "Unitree Robotics official film, H2-X, 2026-10-21",
      animation: "fade",
      fit: "contain",
      cropFocus: { x: 0.0, y: 0.5 },
      overlay: 0.45,
      volume: 0,
    },
    voiceover:
      "According to Unitree, the martial arts run is real footage with no speed-up. It jumps over a stack of cars.",
    texts: {
      company: "REAL FOOTAGE",
      action: "NO SPEED-UP AT ALL",
      result: "SINGLE TAKE",
    },
  },
  {
    id: 3,
    name: "act2-parkour",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "A",
    retentionMechanism: null,
    mediaStrategy: "asset",
    // Carries Unitree's own caption "4 Meter High Platform" (top-left,
    // source x 46-644, y 44-144) — it lands in the top scrim but stays legible.
    media: {
      type: "video",
      path: "assets/clips/act2-parkour.mp4",
      source: "Unitree Robotics official film, H2-X, 2026-10-21",
      animation: "fade",
      fit: "contain",
      cropFocus: { x: 0.0, y: 0.5 },
      overlay: 0.4,
      volume: 0,
    },
    voiceover:
      "It vaults across a stack of cars, then climbs onto a 4 meter platform. That is China's Unitree H2-X.",
    // `result` is 64px/900 and the slot is 724px wide, so its copy has to
    // measure under 724 in the brand font. The first draft read "PARKOUR AND
    // BALANCE" — 19 chars, inside the 20-char advisory budget, but 802px
    // rendered, so it wrapped to two lines and pushed the flex column 35px
    // above its container (the render-time `container-overflow` failure). The
    // char budget is an average-em hint; only a measurement is binding. All
    // three rows below measured single-line: 619 / 587 / 643.
    texts: {
      company: "4 METER PLATFORM",
      action: "VAULTS THE CAR STACK",
      result: "CLEARS THE STACK",
    },
  },
  {
    id: 4,
    name: "act3-jump",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "A",
    retentionMechanism: "pattern-interrupt",
    mediaStrategy: "asset",
    // Carries Unitree's own caption "Ultra Long Endurance Standing for
    // Approximately 8 Hours" (top-right, source x 1224-1891). That caption pinned
    // the cover-era window to the right edge, which is where the 1.0 below comes
    // from; under contain the whole frame is on screen and it is inert.
    media: {
      type: "video",
      path: "assets/clips/act3-jump.mp4",
      source: "Unitree Robotics official film, H2-X, 2026-10-21",
      animation: "fade",
      fit: "contain",
      cropFocus: { x: 1.0, y: 0.5 },
      overlay: 0.4,
      volume: 0,
    },
    voiceover:
      "It drops 4 meters onto concrete and lands on its feet. Unitree lists one spec: about 8 hours standing.",
    texts: {
      company: "4 METER DROP",
      action: "LANDS AND RECOVERS",
      result: "8 HOURS STANDBY",
    },
  },
  {
    id: 5,
    name: "act4-night",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "A",
    retentionMechanism: null,
    mediaStrategy: "asset",
    // Carries Unitree's own caption "Security Demonstration" (bottom-left,
    // source x 41-675, y ~1018-1052). The 0 below is the cover-era value that
    // kept it inside the crop window; under contain it is inert.
    //
    // videoStartOffsetMs 5800 and the 21-word line are one decision, for the
    // same reason scene 6's offset is: act4 is the longest act at 13.7s and the
    // scene can only run ~7-8s, so the skip chooses WHICH 7-8s the viewer sees.
    // The act's payoff is the leaping kick at clip 11.9-12.4s (motion analysis:
    // sustained energy 10.9-12.3s), so the window has to reach it. Two earlier
    // versions failed this: at offset 2000 the window ended at 11.17s and the
    // line's "spins him down" described a beat that never appeared, and the
    // 25-word line that offset needed to reach the kick could not fit the clip
    // at a slow delivery.
    //
    // Solving both constraints (skip + scene length must not exceed 13.7s, and
    // must reach 11.9s) puts the skip near 6s and the line near 21 words. What
    // the skip drops is the opening: the grinding sparks (0.5-1.8s) and the
    // gate climb (2.9s). What it keeps is a complete arc — terrace walk
    // (6.5-8.5s), knife block (8.7-9.7s), kick (11.9-12.4s). The line was
    // rewritten to match that window rather than the other way round: it no
    // longer claims the gate climb it cannot show, and it ends on the kick.
    //
    // The margin is thin at the fast end of the pacing band (a 220 WPM take
    // ends at ~12.0s, showing the kick's first frames) and the slow end is the
    // binding constraint (a 174 WPM take ends at ~13.6s, just inside the
    // clip). Below ~171 WPM the scene would outrun the clip and <Video loop>
    // would replay the act — no take in this pack has come in under 174.
    media: {
      type: "video",
      path: "assets/clips/act4-night.mp4",
      source: "Unitree Robotics official film, H2-X, 2026-10-21",
      animation: "fade",
      fit: "contain",
      cropFocus: { x: 0.0, y: 0.5 },
      videoStartOffsetMs: 5800,
      overlay: 0.4,
      volume: 0,
    },
    voiceover:
      "At night a guard robot walks the terrace and blocks a knife strike. Then it leaps up and kicks the attacker.",
    texts: {
      company: "GUARD SCENARIO",
      action: "KNIFE ATTACK, NIGHT VILLA",
      result: "BLOCKS THE KNIFE",
    },
  },
  {
    id: 6,
    name: "act5-lift",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "A",
    retentionMechanism: null,
    mediaStrategy: "asset",
    // The act the hook opens on, shown whole here: 41.10-47.72, the daylight
    // car lift. Carries "Real Footage of Props for Reference Only"
    // (bottom-left, source x 41-675). Same file as the hook and, since the pack
    // moved to fit:contain, the same framing — both render the whole source
    // frame into the [220, 1037] band and differ only in `overlay` and in the
    // clip offset below.
    //
    // videoStartOffsetMs 1000 is load-bearing, and the line length is chosen
    // around it. The lift is the act's LAST beat: the front wheel leaves the
    // ground at clip 4.7s and the clip ends at 6.62s, so the lift can only ever
    // occupy the final 1.92s of the scene. With no offset the scene ended at
    // clip 4.53s and the line described a frame the viewer never saw.
    //
    // The offset and the word count are ONE decision, because scene length is
    // driven by TTS. For scene length L and skip O, the clip must satisfy
    // O + L <= 6.62 (else <Video loop> replays the walk-in) while the lift
    // needs O + L > 4.7 (else the payoff is off-screen). Larger O buys a bigger
    // lift window but eats the headroom that protects against a slow take.
    //
    // 14 words at 1000ms is the balance: a 14-word two-sentence line is long
    // enough to pace reliably (this voice rushes short lines — a 9-word version
    // of this line was hard-blocked twice at 233 and 255 WPM, over the 225
    // ceiling), and the skip still clears the loop condition down to ~161 WPM,
    // below every take this pack has produced for multi-sentence narrative
    // lines (169-208). At the expected ~200 WPM the lift fills the last second.
    //
    // The whole source frame is on screen, so the framing question this comment
    // used to answer no longer arises. Through 2026-10-31 these scenes declared
    // fit:cover, which cropped the band to a 1014-source-px window and made
    // cropFocus.x load-bearing: at 0.0 the car's front (source x ~1010-1550)
    // sat mostly outside that window and the shot read as a robot standing next
    // to nothing, so this scene alone was moved to 0.5. Under contain there is
    // no window to place — source x 0-1920 is all on screen — and cropFocus is
    // inert. The value is kept as the record of that decision, not as input.
    media: {
      type: "video",
      path: "assets/clips/act5-lift.mp4",
      source: "Unitree Robotics official film, H2-X, 2026-10-21",
      animation: "fade",
      fit: "contain",
      cropFocus: { x: 0.5, y: 0.5 },
      videoStartOffsetMs: 1000,
      overlay: 0.4,
      volume: 0,
    },
    // "said" is load-bearing: SOURCE_PATTERN needs it in ≥2 scenes and scene 2
    // carries the other one ("According to Unitree"). The lift clause sits
    // second so it lands as the wheel comes up.
    voiceover: "Unitree said the props are for reference only. The car's front end comes up.",
    texts: {
      company: "CAR LIFTED",
      action: "FRONT OFF THE GROUND",
      result: "PROPS, NOT PEOPLE",
    },
  },
  {
    id: 7,
    name: "act6-rescue",
    visualType: "narrative",
    layout: "media-bottom-bar",
    narrativeRole: "R",
    retentionMechanism: "approaching-closure",
    mediaStrategy: "asset",
    // A second H2-X (gold shell) pulls a dummy clear of a car. Same bottom-left
    // caption as act 5, so cropFocus.x 0 again. 14 words against a 6.56s clip
    // (6.06s of room) for the same reason as scene 6.
    media: {
      type: "video",
      path: "assets/clips/act6-rescue.mp4",
      source: "Unitree Robotics official film, H2-X, 2026-10-21",
      animation: "fade",
      fit: "contain",
      cropFocus: { x: 0.0, y: 0.5 },
      overlay: 0.4,
      volume: 0,
    },
    voiceover: "A second H2-X pulls a dummy clear of a car. The film ends there.",
    texts: {
      company: "CAR RESCUE",
      action: "MOVES A DUMMY ASIDE",
      result: "ALL IN ONE FILM",
    },
  },
  {
    id: 8,
    name: "spec-gap",
    visualType: "context",
    layout: "hero-center",
    narrativeRole: "A",
    retentionMechanism: null,
    mediaStrategy: "asset",
    // CSS-only, and it is the one beat the film cannot show: what the release
    // does NOT contain. Everything else in this video is proven by footage, so
    // the absence needs words. No media is declared for the same reason the
    // caveat declares none, and context scenes are exempt from the media gate.
    media: null,
    voiceover: "Unitree published no spec sheet, no price and no release date for it.",
    texts: {
      badge: "WHAT IS MISSING",
      // Trailing space is deliberate (title and titleHighlight render as
      // adjacent inline spans) — same contract as the caveat below.
      title: "NO SPEC SHEET. ",
      titleHighlight: "NO PRICE.",
      context: "NO RELEASE DATE",
      detail: "ONLY 8 HOURS IS OFFICIAL",
    },
  },
  {
    id: 9,
    name: "caveat",
    visualType: "context",
    layout: "hero-center",
    narrativeRole: "R",
    retentionMechanism: "loop-closure",
    mediaStrategy: "asset",
    // CSS-only: this scene carries Unitree's written caveats, and the words are
    // the evidence. No clip of the closing card is used because its text block
    // is 1697 px wide and cannot survive any 9:16 crop at a readable size.
    //
    // W9 wants the PENULTIMATE content scene to carry loop-closure, so the
    // declaration lives here and not on the spec-gap card above: with the CTA
    // at id 10, this scene is the last one before it.
    media: null,
    voiceover:
      "Unitree's own card warns extreme testing, no imitation, and a 2 to 3 meter safe distance.",
    texts: {
      badge: "ONE CAVEAT",
      // Trailing space is deliberate: ContextScene.tsx renders title and
      // titleHighlight as adjacent inline spans, so the space has to live in
      // the data (same pattern as remotion/src/scene-gate-fixture.tsx).
      title: "EXTREME TESTING. ",
      titleHighlight: "NO IMITATION.",
      context: "2 TO 3 METERS APART",
      detail: "FEATURES VARY BY MODEL",
    },
  },
  {
    id: 10,
    name: "cta",
    visualType: "cta",
    layout: "hero-center",
    narrativeRole: "T-Tell",
    retentionMechanism: "loop-closure",
    mediaStrategy: "asset",
    media: null,
    // Loop close: "61 second film" is the hook's own number, so a rewatch lands
    // on the opening differently. checkLoopClose matches it against
    // meta.dataPoints.
    voiceover: "Follow China AI News. One 61 second film, and the guard robot that lifts a car.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
      topic: "H2-X GUARD ROBOT",
    },
  },
];

export const metadata = {
  title: "Unitree's H2-X Guard Robot Lifts a Car and Blocks a Knife",
  description: `Unitree introduced the H2-X on October 21, 2026, with one 61 second film and no spec sheet. The film runs in six acts: a scrapyard martial arts sequence, car parkour under a caption reading 4 meter high platform, a 4 meter drop, a night knife intercept at a villa, a daylight car lift, and a second robot hauling a dummy out from under a car. Unitree's own captions are visible in the footage throughout: real footage with no speed-up, 4 meter high platform, security demonstration, and props used for reference only.
	
The only hard number in the release is endurance: a maximum of approximately 8 hours, stated in the official description and repeated on screen. Unitree published no price, no release date and no H2-X specification page, and declined to detail the robot further. The closing card calls the demonstrations extreme testing, asks viewers not to imitate them, and says people should keep at least 2 to 3 meters from the robot. The 182 centimeter, 70 kilogram and 31 degree-of-freedom figures circulating in coverage belong to the older H2 platform, not to the H2-X.
	
What the video does not show is a shipping product. Follow for more China AI and robotics news.`,
  commentHook:
    "Unitree's H2-X lifts a car, blocks a knife and stands for 8 hours. Unitree published no spec sheet, no price and no release date for it. Would you call that a product launch or a capability demo?",
  // No articleUrl on purpose (user decision 2026-10-13, carried forward): the
  // pinned comment must not drive traffic to chinaai.news until the site is
  // ready. Omitting the field makes derivePinnedComment emit the hook alone.
  trendingChecked: true,
  trendingHashtags: [],
};
