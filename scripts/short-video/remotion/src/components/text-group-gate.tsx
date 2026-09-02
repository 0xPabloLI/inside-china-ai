/**
 * TextGroupGate — the vertical (multi-field) layer of the geometry gate (T9,
 * spec decision 68).
 *
 * A band (e.g. media-overlay's top/bottom overlay) renders several gated text
 * fields in one container. Each TextGate fits its own field against WIDTH;
 * before T9 nobody checked the fields' COMBINED height against a vertical
 * budget — every slot's maxHeight was null and shrinkOrder() had no
 * production caller. This component is that caller:
 *
 *   1. children TextGates fit independently as always, then register their
 *      chosen size with the group INSTEAD of releasing the render;
 *   2. once every child has reported, the group measures the band's content
 *      height against the contract budget (getGroup → MEASURED_MAX_HEIGHT);
 *   3. over budget → walk shrinkOrder(): each field steps down its own
 *      fitCandidates ladder (hard floor = minSize, no ×0.9 — decision 68
 *      deleted the proportional stage) and the band is re-measured after
 *      every step; the walk stops as soon as the band fits;
 *   4. still over budget at the floors → structured TextFitError
 *      (reason "group-overflow") carrying the walk trace.
 *
 * The group div IS the band's [data-text-container], so the children's
 * per-gate container asserts keep working unchanged. The final sizes are
 * mirrored onto `data-group-fit` (JSON) for measurement probes.
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { cancelRender, continueRender, delayRender } from "remotion";
import { getGroup, getSlot, shrinkOrder, fitCandidates } from "../../../lib/text-slots.mjs";
import { EPS, FIT_REASONS, TextFitError } from "../../../lib/text-geometry.mjs";

/** What a child TextGate hands the group once its own Fit has chosen a size. */
export type GroupReport = {
  /** The size Fit chose. The group may step it down; this field is mutated. */
  size: number;
  /** Apply a smaller size (React state + one frame) and resolve when laid out. */
  apply: (size: number) => Promise<void>;
};

/** Registration seam the children consume via TextGroupContext. */
export type GroupCoordinator = {
  expect: (slotId: string, handle: number) => void;
  report: (slotId: string, report: GroupReport) => void;
};

export const TextGroupContext = createContext<GroupCoordinator | null>(null);

export type TextGroupGateProps = {
  /** Scene identifier carried into TextFitError. */
  sceneId: string;
  /** Group contract id, e.g. "narrative.media-overlay.bottom-band". */
  groupId: string;
  /** Fixture-only budget override; production resolves the contract value. */
  maxHeight?: number;
  /** Band styles — the group div IS the band container. */
  style?: React.CSSProperties;
  children: React.ReactNode;
};

const ZERO_INK = { left: 0, right: 0, top: 0, bottom: 0 };

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export const TextGroupGate: React.FC<TextGroupGateProps> = ({
  sceneId,
  groupId,
  maxHeight,
  style,
  children,
}) => {
  const budget = getGroup(groupId, { maxHeight });
  const groupRef = useRef<HTMLDivElement>(null);
  /** slotId → the child's delayRender handle, released on approval. */
  const expectedRef = useRef(new Map<string, number>());
  const reportsRef = useRef(new Map<string, GroupReport>());
  const checkedRef = useRef(false);
  const [handle] = useState(() => delayRender(`text-group-gate ${groupId}`));

  const approve = (shrunk: boolean, contentHeight?: number) => {
    const el = groupRef.current;
    if (el) {
      const sizes: Record<string, number> = {};
      for (const [slotId, rep] of reportsRef.current) sizes[slotId] = rep.size;
      el.dataset.groupFit = JSON.stringify({
        shrunk,
        maxHeight: budget.maxHeight,
        contentHeight,
        sizes,
      });
    }
    for (const childHandle of expectedRef.current.values()) continueRender(childHandle);
    continueRender(handle);
  };

  const runCheck = async (): Promise<void> => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    const el = groupRef.current;
    if (!el) {
      approve(false); // unreachable in practice: the ref is set before effects
      return;
    }
    // Content height: scrollHeight includes the band's vertical padding —
    // the budget governs the content box, so strip it.
    const contentHeight = () => {
      const s = getComputedStyle(el);
      return (
        el.scrollHeight -
        (Number.parseFloat(s.paddingTop) || 0) -
        (Number.parseFloat(s.paddingBottom) || 0)
      );
    };
    await nextFrame();
    let total = contentHeight();
    const steps: { slotId: string; fontSize: number }[] = [];
    if (total > budget.maxHeight + EPS) {
      // Production caller of the contract's deterministic shrink order:
      // lowest shrinkPriority first, each field down its own ladder to the
      // hard floor, re-measuring after every step (spec decision 17/68).
      const order = shrinkOrder([...reportsRef.current.keys()]);
      for (const slotId of order) {
        if (total <= budget.maxHeight + EPS) break;
        const rep = reportsRef.current.get(slotId);
        if (!rep) continue;
        const ladder = fitCandidates(getSlot(slotId) as unknown as {
          preferredSize: number;
          minSize: number;
        });
        for (const size of ladder) {
          if (size >= rep.size) continue; // only sizes below the chosen one
          await rep.apply(size);
          rep.size = size;
          steps.push({ slotId, fontSize: size });
          total = contentHeight();
          if (total <= budget.maxHeight + EPS) break;
        }
      }
    }
    if (total > budget.maxHeight + EPS) {
      throw cancelRender(
        new TextFitError({
          reason: FIT_REASONS.groupOverflow,
          sceneId,
          slotId: groupId,
          field: groupId,
          measured: { width: el.clientWidth, height: total },
          available: { width: el.clientWidth, height: budget.maxHeight },
          // A band has no single font size; carry the walk's last step (0
          // when the budget was already exceeded before any shrink).
          fontSize: steps.length > 0 ? steps[steps.length - 1].fontSize : 0,
          inkPad: ZERO_INK,
          steps,
        }),
      );
    }
    approve(steps.length > 0, total);
  };

  const coordinator = useMemo<GroupCoordinator>(
    () => ({
      expect: (slotId, childHandle) => {
        expectedRef.current.set(slotId, childHandle);
      },
      report: (slotId, report) => {
        reportsRef.current.set(slotId, report);
        if (reportsRef.current.size === expectedRef.current.size) {
          void runCheck();
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    // Children register during their own mount effects, which run before this
    // parent effect — expectedRef is final here. An empty band (no text
    // fields at all) must still release the render.
    if (expectedRef.current.size === 0) {
      continueRender(handle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <TextGroupContext.Provider value={coordinator}>
      <div ref={groupRef} data-text-group={groupId} data-text-container style={style}>
        {children}
      </div>
    </TextGroupContext.Provider>
  );
};

/** Group seam for a child TextGate; null outside any band. */
export function useTextGroup(): GroupCoordinator | null {
  return useContext(TextGroupContext);
}
