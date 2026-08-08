import type { TemplateEntry } from "./registry";
import NewsletterEmail from "./newsletter";

/**
 * Weekly newsletter template entry. Lives outside the React component file
 * so newsletter.tsx only exports components (fast-refresh friendly).
 */
export const template = {
  component: NewsletterEmail,
  subject: (data: Record<string, unknown>) =>
    (data.subject as string | undefined) ||
    (data.title as string | undefined) ||
    "Latest from China AI News",
  displayName: "Weekly Newsletter",
  previewData: {
    siteName: "China AI News",
    siteUrl: "https://chinaai.news",
    subject: "DeepSeek's next move, Alibaba Qwen 3, and ByteDance Seed",
    title: "DeepSeek's next move, Alibaba Qwen 3, and ByteDance Seed",
    excerpt:
      "This week: leaked investor notes from DeepSeek, Alibaba open-sources Qwen 3, and ByteDance Seed ships a new video model.",
    content:
      "China AI News tracks the labs, startups, and policy shifts shaping the Chinese AI landscape. Here is what mattered this week.",
    postUrl: "https://chinaai.news/posts/weekly-roundup",
    publishedAt: "August 3, 2026",
  },
} satisfies TemplateEntry;
