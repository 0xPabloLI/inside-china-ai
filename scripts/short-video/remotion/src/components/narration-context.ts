import { createContext, useContext } from "react";

/**
 * Whether the scene currently on screen has narration audio (#1525).
 *
 * The narration track is mounted by ShortVideo outside the visual
 * TransitionSeries, so a scene component cannot see it through props without
 * threading the flag through every visualType. Context keeps the audio decision
 * at the one place that knows it and lets MediaBackground duck the source
 * under the voice only when a voice actually exists in this scene.
 */
export const NarrationContext = createContext(false);

export const useNarrationActive = () => useContext(NarrationContext);
