import { ExternalLink } from "lucide-react";

/**
 * Extract the TikTok video ID from a full TikTok URL.
 *
 * Matches: https://www.tiktok.com/@username/video/1234567890
 * Also matches: https://tiktok.com/@username/video/1234567890?query=params
 *
 * @returns The numeric video ID string, or null if the URL is not a valid TikTok video URL.
 */
export function extractTikTokVideoId(url: string): string | null {
  if (!url || !url.trim()) return null;
  const match = url.match(/tiktok\.com\/[^/]+\/video\/(\d+)/);
  return match?.[1] ?? null;
}

/**
 * TikTok Embed Component
 *
 * Renders TikTok's official blockquote-based embed. When embed.js loads,
 * it transforms the blockquote into an iframe player. If embed.js fails
 * or the video is unavailable, the fallback "Watch on TikTok" link remains.
 *
 * @param url - Full TikTok video URL (e.g. https://www.tiktok.com/@chinaainews/video/123)
 */
export function TikTokEmbed({ url }: { url: string }) {
  const videoId = extractTikTokVideoId(url);

  if (!videoId) {
    // Fallback: can't extract video ID, just show a link
    return (
      <section className="mt-12 border-t border-border/60 pt-8">
        <h2 className="mb-4 font-serif text-2xl">Watch</h2>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          Watch on TikTok
          <ExternalLink className="h-4 w-4" />
        </a>
      </section>
    );
  }

  return (
    <section className="mt-12 border-t border-border/60 pt-8">
      <h2 className="mb-4 font-serif text-2xl">Watch</h2>
      <blockquote
        className="tiktok-embed"
        cite={url}
        data-video-id={videoId}
        style={{ maxWidth: "880px", minWidth: "288px" }}
      >
        <section>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Watch on TikTok
            <ExternalLink className="h-4 w-4" />
          </a>
        </section>
      </blockquote>
    </section>
  );
}
