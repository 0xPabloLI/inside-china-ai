/**
 * SplitHighlight — T8 substring annotation.
 *
 * `texts.highlight` is structured ({ field, text }): the author names the
 * field whose copy carries the fragment and the exact substring to annotate.
 * This component splits that field's copy around the fragment and wraps ONLY
 * the fragment in the rough-notation annotation — before/after render as
 * plain text. A highlight targeting a different field renders nothing here.
 *
 * Substring-ness is enforced upstream by assertKnownTextFields (the render
 * fails otherwise), so indexOf() cannot miss; the -1 branch is unreachable
 * through ShortVideo and falls back to plain text for direct template use
 * (the scene-gate fixture).
 */
import { Highlight, Underline } from "@remotion/rough-notation";
import { ANNOTATION } from "./shared";

export const SplitHighlight: React.FC<{
  /** The field's full copy (already resolved by the caller). */
  text: string;
  /** The scene's structured highlight, if any. */
  highlight?: { field: string; text: string };
  /** Which field this caller renders — highlight must target it. */
  field: string;
  /** Animation progress for the rough-notation draw (0..1). */
  progress: number;
  /** Marker band (narrative action/result) or stroke (hook claim). */
  variant: "highlight" | "underline";
  /** Underline stroke color; the marker band uses its own token. */
  color?: string;
}> = ({ text, highlight, field, progress, variant, color }) => {
  const fragment = highlight && highlight.field === field ? highlight.text : null;
  if (!fragment) {
    return <>{text}</>;
  }
  const at = text.indexOf(fragment);
  if (at === -1) {
    return <>{text}</>;
  }
  const before = text.slice(0, at);
  const after = text.slice(at + fragment.length);
  if (variant === "underline") {
    return (
      <>
        {before}
        <Underline
          color={color}
          progress={progress}
          strokeWidth={ANNOTATION.underline.strokeWidth}
          padding={ANNOTATION.underline.padding}
        >
          {fragment}
        </Underline>
        {after}
      </>
    );
  }
  return (
    <>
      {before}
      <Highlight
        color={ANNOTATION.highlight.color}
        progress={progress}
        padding={ANNOTATION.highlight.padding}
      >
        {fragment}
      </Highlight>
      {after}
    </>
  );
};
