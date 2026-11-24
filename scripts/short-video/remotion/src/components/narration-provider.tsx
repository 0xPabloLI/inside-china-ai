import { NarrationContext } from "./narration-context";

/**
 * Provides whether the current scene has narration audio (#1525).
 *
 * Split from the context module so Fast Refresh sees a file that exports a
 * component only; the hook lives beside the context in narration-context.ts.
 */
export const NarrationProvider = ({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) => <NarrationContext.Provider value={active}>{children}</NarrationContext.Provider>;
