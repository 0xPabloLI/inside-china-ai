/**
 * Motion budget context (#731).
 *
 * A scene declares, through `<Camera visualType duration>`, the last frame on
 * which composition motion may still change (the hold boundary). Entrance
 * primitives read it and pull themselves earlier if their authored delay would
 * run into the closing still window — that is what turns the HOLD token from a
 * declaration into a structural guarantee.
 *
 * Scenes rendered without a Camera (tests/fixtures) get `null` and keep their
 * authored timing unchanged.
 */
import { createContext, useContext } from "react";
import { secToFrames } from "./shared";
import { fitEntranceWindow } from "../tokens";

export const MotionBudgetContext = createContext<number | null>(null);

/** Hook form: seconds in, scene frames out, boundary from the scene's Camera. */
export function useEntranceWindow(delay: number, duration: number): { start: number; end: number } {
  const settleAt = useContext(MotionBudgetContext);
  return fitEntranceWindow(secToFrames(delay), secToFrames(duration), settleAt);
}
