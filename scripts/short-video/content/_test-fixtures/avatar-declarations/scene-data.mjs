/**
 * Avatar declaration fixtures (#214 ticket 01).
 *
 * Three scene groups exercising the optional `scene.avatar` contract
 * (spec-digital-human-pipeline.md, Implementation Decisions 1/7):
 *   validAvatarScene      — declaration state {}, passes checkAvatarContract
 *   unknownFieldScene     — typo'd key, must fail-closed
 *   badPresentScene       — from >= to interval, must fail-closed
 *
 * Consumed by __tests__/scene-rules-avatar.test.mjs. Scenes are minimal
 * CTA-shaped declarations — they are unit fixtures for the avatar contract,
 * not full packages (scene-count etc. are out of scope here).
 */

const ctaBase = {
  id: 6,
  name: "cta",
  visualType: "cta",
  voiceover: "Follow for more China AI news that matters.",
  texts: {
    brand: "CHINA AI NEWS",
    tagline: "DAILY CHINA AI BRIEFING",
    action: "FOLLOW FOR MORE",
  },
};

// Declaration state: generation step writes videoPath back later.
export const validAvatarScene = { ...ctaBase, avatar: {} };

// Generated state: videoPath written back by the generation step.
export const generatedAvatarScene = {
  ...ctaBase,
  avatar: { videoPath: "assets/avatar/cta.mp4", position: "right-card" },
};

// Typo'd key — fail-closed: unknown fields must be rejected before TTS.
export const unknownFieldScene = { ...ctaBase, avatar: { vedioPath: "a.mp4" } };

// Malformed present interval (from >= to) — fail-closed.
export const badPresentScene = { ...ctaBase, avatar: { present: [{ from: 3, to: 3 }] } };

// Conventional package export: the valid group, so glob-based tooling that
// imports content/*/scene-data.mjs always sees a coherent package.
export const scenes = [validAvatarScene];
