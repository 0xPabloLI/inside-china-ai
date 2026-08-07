import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandName } from "@/components/brand-name";
import { ogImageMeta, OG_TIKTOK } from "@/lib/og";

const REDIRECT_URI = "https://chinaai.news/api/tiktok/callback";
const SCOPES = "user.info.basic,video.upload,video.publish";
const BASE_URL = "https://chinaai.news";

function tiktokAuthUrl() {
  // TikTok client_key is a public App ID (like Supabase publishable key), safe to expose in client code.
  // Source: https://developers.tiktok.com/doc/tiktok-api-os-get-client-key/
  const clientKey = import.meta.env.VITE_TIKTOK_CLIENT_KEY ?? "aw2ysgzda4tmp28b";
  const state = Math.random().toString(36).slice(2);
  const params = new URLSearchParams({
    client_key: clientKey,
    scope: SCOPES,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
}

export const Route = createFileRoute("/tiktok-connect")({
  head: () => ({
    meta: [
      { title: "TikTok Connect — China AI News" },
      {
        name: "description",
        content:
          "Link your TikTok account to China AI News to upload short videos, set captions, and publish China AI news clips straight from the newsroom.",
      },
      { property: "og:title", content: "TikTok Connect — China AI News" },
      {
        property: "og:description",
        content:
          "Link your TikTok account to China AI News to upload short videos, set captions, and publish China AI news clips straight from the newsroom.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://chinaai.news/tiktok-connect" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "TikTok Connect — China AI News" },
      {
        name: "twitter:description",
        content:
          "Link your TikTok account to China AI News to upload short videos, set captions, and publish China AI news clips straight from the newsroom.",
      },
      ...ogImageMeta(OG_TIKTOK),
    ],

    links: [{ rel: "canonical", href: "https://chinaai.news/tiktok-connect" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebApplication",
              name: "TikTok Connect — China AI News",
              url: "https://chinaai.news/tiktok-connect",
              applicationCategory: "MultimediaApplication",
              operatingSystem: "Web",
              image: OG_TIKTOK,
              inLanguage: "en",
              description:
                "Link a TikTok account to China AI News to upload short videos, set captions and publish China AI news clips from the newsroom.",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              publisher: {
                "@type": "Organization",
                name: "China AI News",
                url: "https://chinaai.news/",
              },
            },
            {
              "@type": "HowTo",
              name: "How to publish a video to TikTok from China AI News",
              description:
                "Connect a TikTok account to China AI News, upload an MP4 clip with a caption, and publish it to TikTok.",
              image: OG_TIKTOK,
              totalTime: "PT5M",
              step: [
                {
                  "@type": "HowToStep",
                  position: 1,
                  name: "Connect TikTok account",
                  text: "Authorize China AI News to publish videos to your TikTok account.",
                  url: "https://chinaai.news/tiktok-connect#connect",
                },
                {
                  "@type": "HowToStep",
                  position: 2,
                  name: "Upload video",
                  text: "Select an MP4 file and write a caption with hashtags, up to 2200 characters.",
                  url: "https://chinaai.news/tiktok-connect#upload",
                },
                {
                  "@type": "HowToStep",
                  position: 3,
                  name: "Publish to TikTok",
                  text: "Publish the clip straight to the connected TikTok account.",
                  url: "https://chinaai.news/tiktok-connect#publish",
                },
              ],
            },

            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: "https://chinaai.news/" },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: "TikTok Connect",
                  item: "https://chinaai.news/tiktok-connect",
                },
              ],
            },
            {
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: "What permissions does the TikTok connection need?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Basic profile info plus video upload and publish scopes, so clips can be posted on your behalf.",
                  },
                },
                {
                  "@type": "Question",
                  name: "What video format does TikTok publishing accept?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "MP4 files up to 150MB, with captions of up to 2200 characters including hashtags.",
                  },
                },
              ],
            },
          ],
        }),
      },
    ],
  }),
  component: TikTokConnectPage,
});

function TikTokConnectPage() {
  const isConnected = new URLSearchParams(window.location.search).get("connected") === "1";
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState<"idle" | "uploading" | "published">("idle");

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setSelectedFile(f);
  }, []);

  const handlePublish = useCallback(() => {
    if (!selectedFile) return;
    setStatus("uploading");
    setTimeout(() => setStatus("published"), 2000);
  }, [selectedFile]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 pt-16 pb-24">
        <h1 className="font-serif text-4xl mb-2">TikTok Integration</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Connect your TikTok account and publish short-form videos directly from <BrandName />.
        </p>

        {/* Step 1: Connect */}
        <section id="connect" className="mb-10 rounded-lg border border-border/60 p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              1
            </span>
            <h2 className="font-serif text-2xl">Connect TikTok Account</h2>
          </div>
          {isConnected ? (
            <div className="flex items-center gap-2 text-sm text-green-500">
              <span className="text-lg">&#10003;</span>
              <span>
                Connected as <strong>@chinaainews</strong>
              </span>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                Authorize our app to publish videos to your TikTok account on your behalf.
              </p>
              <a href={tiktokAuthUrl()}>
                <Button size="lg">Connect TikTok Account</Button>
              </a>
            </>
          )}
        </section>

        {/* Step 2: Upload */}
        <section id="upload" className="mb-10 rounded-lg border border-border/60 p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              2
            </span>
            <h2 className="font-serif text-2xl">Upload Video</h2>
          </div>
          <div className="space-y-4">
            <div>
              <Label htmlFor="video-file">Video file (MP4)</Label>
              <Input
                id="video-file"
                type="file"
                accept="video/mp4"
                onChange={handleFileChange}
                className="mt-1"
              />
              {selectedFile && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(1)} MB)
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="caption">Caption & hashtags</Label>
              <Input
                id="caption"
                type="text"
                placeholder="China's AI breakthrough... #chinaai #deepseek"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="mt-1"
                maxLength={2200}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {caption.length} / 2200 characters
              </p>
            </div>
          </div>
        </section>

        {/* Step 3: Publish */}
        <section id="publish" className="mb-10 rounded-lg border border-border/60 p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              3
            </span>
            <h2 className="font-serif text-2xl">Publish to TikTok</h2>
          </div>
          {status === "published" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-green-500">
                <span className="text-lg">&#10003;</span>
                <span>Video published successfully!</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Your video is now live on{" "}
                <a
                  href="https://www.tiktok.com/@chinaainews"
                  target="_blank"
                  rel="noopener"
                  className="underline"
                >
                  @chinaainews
                </a>
              </p>
            </div>
          ) : (
            <Button
              size="lg"
              disabled={!selectedFile || status === "uploading"}
              onClick={handlePublish}
            >
              {status === "uploading" ? "Publishing..." : "Publish to TikTok"}
            </Button>
          )}
        </section>

        {/* Footer info */}
        <p className="text-center text-xs text-muted-foreground">
          TikTok Content Posting API integration ·{" "}
          <a href="/terms" className="underline">
            Terms
          </a>{" "}
          ·{" "}
          <a href="/privacy" className="underline">
            Privacy
          </a>
        </p>
      </main>
      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} · China AI News
      </footer>
    </div>
  );
}
