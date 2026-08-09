import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExternalLink, Copy, RefreshCw, Image as ImageIcon } from "lucide-react";
import { SITE_URL, ogImageForPath } from "@/lib/og";

type Debugger = {
  name: string;
  note: string;
  href: (url: string) => string;
};

const DEBUGGERS: Debugger[] = [
  {
    name: "Facebook / Instagram",
    note: "Click “Scrape Again” to force a re-fetch.",
    href: (u) => `https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(u)}`,
  },
  {
    name: "LinkedIn Post Inspector",
    note: "Inspecting the URL clears LinkedIn's cache automatically.",
    href: (u) => `https://www.linkedin.com/post-inspector/inspect/${encodeURIComponent(u)}`,
  },
  {
    name: "Telegram (@WebpageBot)",
    note: "Send the URL to @WebpageBot to drop its cache.",
    href: () => "https://t.me/WebpageBot",
  },
  {
    name: "X / Twitter",
    note: "No public validator any more — post the link in a draft to see the fresh card.",
    href: (u) => `https://x.com/compose/post?text=${encodeURIComponent(u)}`,
  },
  {
    name: "Google Rich Results",
    note: "Checks structured data and the crawled preview image.",
    href: (u) => `https://search.google.com/test/rich-results?url=${encodeURIComponent(u)}`,
  },
  {
    name: "OpenGraph.xyz preview",
    note: "Neutral cross-platform render of the current tags.",
    href: (u) => `https://www.opengraph.xyz/url/${encodeURIComponent(u)}`,
  },
];

function normalize(input: string): string {
  const v = input.trim();
  if (!v) return SITE_URL;
  if (/^https?:\/\//.test(v)) return v;
  return `${SITE_URL}${v.startsWith("/") ? "" : "/"}${v}`;
}

/**
 * "Refresh social preview" helper: opens every platform link debugger for a URL
 * and documents the order to run them in.
 */
export function SocialPreviewRefresh({
  path = "/",
  compact = false,
}: {
  path?: string;
  compact?: boolean;
}) {
  const [raw, setRaw] = useState(path);
  const url = useMemo(() => normalize(raw), [raw]);
  const ogImage = useMemo(() => {
    try {
      return ogImageForPath(new URL(url).pathname);
    } catch {
      return ogImageForPath("/");
    }
  }, [url]);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed — select the field and copy manually");
    }
  };

  const refreshAll = () => {
    for (const d of DEBUGGERS) {
      window.open(d.href(url), "_blank", "noopener,noreferrer");
    }
    toast.success("Opened all link debuggers");
  };

  return (
    <section className="rounded-lg border border-border/60 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl">Social preview refresh</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Platforms cache the OG image they last scraped. Re-scrape here after changing a title,
            description or preview image.
          </p>
        </div>
        <Button type="button" onClick={refreshAll} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh all
        </Button>
      </div>

      <div className="mt-4">
        <Label htmlFor="social-preview-url">Page URL or path</Label>
        <div className="mt-1 flex gap-2">
          <Input
            id="social-preview-url"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            className="font-mono text-sm"
            placeholder="/posts/my-article"
          />
          <Button type="button" variant="outline" onClick={() => copy(url, "URL")}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{url}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-border/50 bg-background p-3">
        <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          Preview image in use (auto-selected template, default fallback):
        </span>
        <a
          href={ogImage}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-xs underline decoration-border hover:decoration-foreground"
        >
          {ogImage.replace(SITE_URL, "")}
        </a>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {DEBUGGERS.map((d) => (
          <li key={d.name} className="rounded-md border border-border/50 p-3">
            <a
              href={d.href(url)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium hover:underline"
            >
              {d.name}
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
            <p className="mt-1 text-xs text-muted-foreground">{d.note}</p>
          </li>
        ))}
      </ul>

      {compact ? null : (
        <div className="mt-5 rounded-md border border-dashed border-border/60 p-4">
          <h3 className="text-sm font-medium">How to confirm the new image is live</h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs text-muted-foreground">
            <li>Publish the app first — debuggers read the live site, not the preview build.</li>
            <li>
              Open the page and check <code>og:image</code> in view-source; it must be an absolute{" "}
              <code>https://chinaai.news/…</code> URL.
            </li>
            <li>Run “Refresh all”, then re-scrape in Facebook and re-inspect in LinkedIn.</li>
            <li>
              Compare the rendered card against the image linked above. If it still shows the old
              art, wait a few minutes and re-scrape — some caches are eventually consistent.
            </li>
            <li>
              Already-shared links keep the old card until the platform re-fetches on its own
              schedule; a forced re-scrape only fixes future shares and the debugger view.
            </li>
          </ol>
        </div>
      )}
    </section>
  );
}
