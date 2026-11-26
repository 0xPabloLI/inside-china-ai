/**
 * FixedCollisionAssert — scene-level bbox collision gate (#1561).
 *
 * The header/footer carries elements that are NOT part of any TextGate slot
 * contract: the BrandBar lockup, the BRIEFING chip, the hook badge pill,
 * the fullscreen source footer. Each one used to be positioned independently,
 * so nothing stopped two of them from covering each other — the ABot-World 0.5
 * hook opened on the red badge pill sitting over both the wordmark and the
 * chip.
 *
 * Any element that opts in with `data-collision-box="<id>"` is measured
 * (layout rect at the settled frame) and checked pairwise with its siblings
 * inside the SAME scene. A partial intersection cancels the render with
 * `[FixedCollisionError] {json}`; containment is legal (a chip inside a bar
 * is the element tree, not a layout defect), and zero-area boxes are absent.
 *
 * No template whitelist: the gate lives in ShortVideo around every scene and
 * judges whatever opted in, so a future template cannot be exempt by omission.
 * The verdict rules live in lib/collision-geometry.mjs and are shared with
 * preflight's `checkHeaderSlots`, so the declared contract and the measured
 * DOM cannot drift apart.
 *
 * Timing mirrors TextGate/AnnotationCollisionAssert: frames before the settled
 * frame are motion-blind (entrance transforms move boxes without changing
 * layout), then the gate waits for fonts and two rAFs so the Fit ladder has
 * committed, and records the measured boxes on `data-fixed-collision` for
 * probes.
 */
import React, { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cancelRender, continueRender, delayRender, useCurrentFrame } from "remotion";
import { findBoxCollisions } from "../../../lib/collision-geometry.mjs";
import { nextFrame } from "./text-gate";

const BOX_SELECTOR = "[data-collision-box]";

export type FixedCollisionAssertProps = {
  /** Scene identifier carried into the error payload. */
  sceneId: string;
  /** Frame from which layout is at rest. Default 40 (global settled contract). */
  settledFrame?: number;
  children: ReactNode;
};

type MeasuredBox = {
  id: string;
  box: { x: number; y: number; width: number; height: number };
};

export const FixedCollisionAssert: React.FC<FixedCollisionAssertProps> = ({
  sceneId,
  settledFrame = 40,
  children,
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const checkedRef = useRef(false);
  const frame = useCurrentFrame();
  const [handle] = useState(() => delayRender(`fixed-collision ${sceneId}`));

  useLayoutEffect(() => {
    if (frame < settledFrame) {
      continueRender(handle);
      return;
    }
    if (checkedRef.current) return;
    checkedRef.current = true;

    void (async () => {
      // Fonts change every measured width; never judge the fallback face.
      try {
        await document.fonts.ready;
      } catch {
        /* font race degraded — the TextGate layer still owns text fit */
      }
      // TextGate's Fit ladder commits asynchronously and holds the render
      // open. Measuring before it lands sees the pre-fit candidate (the badge
      // at preferred 40 was 738px wide in a 663px slot), so wait until every
      // gate in this scene reports ready, then let the commit paint.
      for (let i = 0; i < 120; i += 1) {
        const host = hostRef.current;
        if (!host) break;
        const pending = Array.from(host.querySelectorAll("[data-text-slot]")).filter(
          (el) => el.getAttribute("data-text-ready") !== "1",
        );
        if (pending.length === 0) break;
        await nextFrame();
      }
      await nextFrame();
      await nextFrame();

      const host = hostRef.current;
      if (!host) {
        continueRender(handle);
        return;
      }
      const entries: MeasuredBox[] = [];
      for (const el of Array.from(host.querySelectorAll(BOX_SELECTOR))) {
        if (!(el instanceof HTMLElement)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const id = el.getAttribute("data-collision-box");
        if (!id) continue;
        entries.push({
          id,
          box: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        });
      }

      const collisions = findBoxCollisions(entries);
      host.dataset.fixedCollision = JSON.stringify({
        sceneId,
        settledFrame,
        boxes: entries,
        collisions,
      });

      if (collisions.length > 0) {
        throw cancelRender(
          new Error(`[FixedCollisionError] ${JSON.stringify({ sceneId, collisions })}`),
        );
      }
      continueRender(handle);
    })().catch((err) => {
      // Release the handle FIRST so a real failure cannot wedge the render,
      // then re-propagate (cancelRender unwinds via throw).
      continueRender(handle);
      throw err;
    });
  }, [frame, handle, sceneId, settledFrame]);

  return (
    <div ref={hostRef} style={{ position: "absolute", inset: 0 }}>
      {children}
    </div>
  );
};
