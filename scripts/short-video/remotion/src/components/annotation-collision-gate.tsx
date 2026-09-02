/**
 * AnnotationCollisionAssert — F7, scene-level annotation collision gate
 * (spec decision 7, T10 ticket).
 *
 * The per-slot TextGate polices the annotation against ITS OWN slot; it has
 * no view of the NEIGHBOUR slots a big annotation can cover. This component
 * closes that gap for annotated focal numbers (Hook bigNumber circle):
 *
 *   - collider: the source slot's annotation SVG drawn box, in composition
 *     coordinates (getBBox → getScreenCTM four corners → composition coords
 *     plus stroke paint margin ONLY — random offsets are baked into the path
 *     `d`), the exact geometry TextGate's settled assert uses;
 *   - targets: each named neighbour slot's TEXT extent (textExtentComposition,
 *     not the wrapper box — a centered full-width wrapper would dilute the
 *     ratio with dead space);
 *   - ratio: intersection area / target text area, computed PER TARGET —
 *     decision 7 forbids merging denominators (subject and numberLabel are
 *     judged independently); the annotated target itself is never listed, the
 *     circle is SUPPOSED to wrap it.
 *
 * Ordering is fixed by decision 6: Fit 数字 → 生成 Circle → F7 碰撞 Assert.
 * A breach FAILs structured (annotation-collision) — Fit never shrinks to
 * dodge a collision.
 *
 * Timing matches TextGate's settled policy: frames before settledFrame are
 * motion-blind (entrance transforms move drawn boxes without changing
 * layout). From settledFrame on the collider geometry is polled across frames
 * — the source gate mounts its annotation during its own async Fit, so the
 * first settled commit can predate the SVG (a still render commits exactly
 * once). Ratios are recorded onto the host element (`data-annotation-collision`,
 * JSON) every evaluation so probes can surface the actual numbers (ticket:
 * 记录实际 ratio). A source gate that never produces an annotation is NOT
 * this assert's failure class — the gate's own annotation-missing / policy
 * check owns that.
 */
import React, { useLayoutEffect, useRef, useState } from "react";
import { cancelRender, continueRender, delayRender, useCurrentFrame } from "remotion";
import { getSlot, parseSlotId } from "../../../lib/text-slots.mjs";
import { FIT_REASONS, TextFitError } from "../../../lib/text-geometry.mjs";
import {
  annotationDrawnBox,
  pollUntilStable,
  textExtentComposition,
  ZERO_PAD,
  type Box,
} from "./text-gate";

export type AnnotationCollisionAssertProps = {
  /** Scene identifier carried into TextFitError. */
  sceneId: string;
  /** Slot whose annotation SVG is the collider, e.g. hook.hero-center.bigNumber. */
  sourceSlotId: string;
  /**
   * Slots whose TEXT must not be overlapped, each judged separately. Omit the
   * annotated slot itself — that overlap is the annotation's purpose.
   */
  targetSlotIds: string[];
  /** Max overlap per target as a fraction of its text area. Decision 7: 0.02. */
  maxRatio?: number;
  /** Frame from which the assert runs. Default: the source slot's contract. */
  settledFrame?: number;
};

/** Intersection of two AABBs (0-area when disjoint). */
function intersectionOf(a: Box, b: Box): { width: number; height: number } {
  return {
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)),
  };
}

export const AnnotationCollisionAssert: React.FC<AnnotationCollisionAssertProps> = ({
  sceneId,
  sourceSlotId,
  targetSlotIds,
  maxRatio = 0.02,
  settledFrame,
}) => {
  const settledAt = settledFrame ?? (getSlot(sourceSlotId) as { settledFrame: number }).settledFrame;
  const hostRef = useRef<HTMLDivElement>(null);
  const frame = useCurrentFrame();
  // The evaluation polls across frames (the source gate's async Fit can
  // settle after this commit), so it must hold the render open — without a
  // handle remotion still captures before the evaluation and the assert
  // would silently no-op. Same discipline as TextGate's own fit handle.
  const [handle] = useState(() => delayRender(`annotation-collision ${sourceSlotId}`));

  useLayoutEffect(() => {
    if (frame < settledAt) {
      continueRender(handle);
      return;
    }
    let cancelled = false;

    /** Geometry snapshot: collider box + every resolvable target text box. */
    const snapshot = () => {
      const sourceGate = document.querySelector(
        `[data-text-slot="${sourceSlotId}"]`,
      ) as HTMLElement | null;
      const collider = sourceGate ? annotationDrawnBox(sourceGate) : null;
      if (!sourceGate || !collider) return null;
      const targets: Record<string, Box> = {};
      for (const targetSlotId of targetSlotIds) {
        const targetGate = document.querySelector(
          `[data-text-slot="${targetSlotId}"]`,
        ) as HTMLElement | null;
        if (targetGate) targets[targetSlotId] = textExtentComposition(targetGate);
      }
      return { sourceGate, collider, targets };
    };

    void (async () => {
      // Poll until the geometry has been stable for a few consecutive frames:
      // the gate's Fit ladder moves font sizes (and with them the ellipse and
      // the neighbour text boxes) frame by frame, so an early evaluation
      // would measure a transient state. Stability keys over PLAIN geometry
      // only — snapshot.sourceGate is a live HTMLElement (cyclic).
      const snap = await pollUntilStable(
        snapshot,
        (s) => (s == null ? "none" : JSON.stringify({ collider: s.collider, targets: s.targets })),
        { tries: 90, stableFrames: 5, isCancelled: () => cancelled },
      );
      if (cancelled) return;
      if (!snap) {
        // No source slot / annotation ever appeared — not this assert's
        // failure class (the gate's own annotation-missing / policy check
        // owns that); release the render.
        continueRender(handle);
        return;
      }
      // Decision 67a discipline: a DECLARED target whose gate never mounted
      // is a fail-closed condition, not a silent skip — dropping it would
      // let a typo'd slot id pass while asserting nothing.
      const missingTargets = targetSlotIds.filter((id) => !(id in snap.targets));
      if (missingTargets.length > 0) {
        throw cancelRender(
          new TextFitError({
            reason: FIT_REASONS.annotationMissing,
            sceneId,
            slotId: sourceSlotId,
            field: parseSlotId(sourceSlotId).field,
            measured: { width: 0, height: null },
            available: { width: 0, height: null },
            fontSize: 0,
            inkPad: ZERO_PAD,
            details: { missingTargets },
          }),
        );
      }

      const ratios: Record<string, number> = {};
      for (const [targetSlotId, textBox] of Object.entries(snap.targets)) {
        if (textBox.width <= 0 || textBox.height <= 0) continue; // no text, no collision
        const over = intersectionOf(snap.collider, textBox);
        const ratio = (over.width * over.height) / (textBox.width * textBox.height);
        ratios[targetSlotId] = ratio;
        // Ratio-space tolerance (float noise only — real collisions land
        // far above the threshold; decision 7: 2–3% borderline cases get
        // geometry fixes, never a wider gate).
        if (ratio > maxRatio + 1e-6) {
          const textEl = snap.sourceGate.firstElementChild as HTMLElement | null;
          throw cancelRender(
            new TextFitError({
              reason: FIT_REASONS.annotationCollision,
              sceneId,
              slotId: sourceSlotId,
              field: parseSlotId(sourceSlotId).field,
              measured: { width: over.width, height: over.height },
              available: { width: textBox.width, height: textBox.height },
              fontSize: textEl ? Number.parseFloat(getComputedStyle(textEl).fontSize) || 0 : 0,
              inkPad: ZERO_PAD,
              details: { targetSlotId, ratio, maxRatio, ratios },
            }),
          );
        }
      }
      if (hostRef.current) {
        hostRef.current.dataset.annotationCollision = JSON.stringify({
          settledFrame: settledAt,
          maxRatio,
          ratios,
        });
      }
      continueRender(handle);
    })().catch((err) => {
      // Release the handle FIRST so the render can never wedge on this path,
      // then re-propagate — same discipline as TextGate's assertAnnotation
      // catch (cancelRender unwinds via throw).
      continueRender(handle);
      if (!cancelled) throw cancelRender(err instanceof Error ? err : new Error(String(err)));
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  return <div ref={hostRef} data-annotation-collision-source={sourceSlotId} hidden />;
};
