import { useEffect, useState } from "react";
import { calcReadingProgress } from "@/lib/reading-progress";

/**
 * A thin fixed progress bar at the top of the viewport that tracks
 * reading progress through an article. Uses the brand blue (#4d8bff)
 * to reinforce brand identity.
 *
 * Mounts only on article pages. Uses passive scroll listener.
 * Respects prefers-reduced-motion (transition disabled).
 *
 * Uses --color-brand token (Dispatch Blue) for brand consistency.
 */
export function ReadingProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const updateProgress = () => {
      setProgress(
        calcReadingProgress(
          window.scrollY,
          document.documentElement.scrollHeight,
          window.innerHeight,
        ),
      );
    };

    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);

    return () => {
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, []);

  return (
    <div className="fixed top-0 left-0 z-50 h-0.5 w-full" aria-hidden="true">
      <div
        className="reading-progress-bar h-full bg-brand transition-[width] duration-75 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
