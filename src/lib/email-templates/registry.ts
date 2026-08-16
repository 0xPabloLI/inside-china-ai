import type { ComponentType } from "react";
import { template as newsletterTemplate } from "./newsletter-template";
import { template as rankingAlertTemplate } from "./ranking-alert";

export type TemplateData = Record<string, unknown>;

export interface TemplateEntry {
  component: ComponentType<TemplateData>;
  subject: string | ((data: TemplateData) => string);
  displayName?: string;
  previewData?: TemplateData;
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string;
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  newsletter: newsletterTemplate,
  "ranking-alert": rankingAlertTemplate,
};
