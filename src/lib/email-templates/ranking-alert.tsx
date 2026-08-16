import React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface AlertItem {
  keyword: string;
  from?: number | null;
  to?: number | null;
}

interface Props {
  alerts?: AlertItem[];
  capturedOn?: string;
}

function describe(alert: AlertItem): string {
  const from = alert.from ?? null;
  const to = alert.to ?? null;
  if (to === null) return `${alert.keyword} — dropped out of the top 100 (was #${from ?? "?"})`;
  return `${alert.keyword} — #${from ?? "?"} → #${to}`;
}

const Email = ({ alerts = [], capturedOn }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {alerts.length > 0
        ? `${alerts.length} tracked keyword${alerts.length === 1 ? "" : "s"} lost ground`
        : "Keyword ranking update"}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>China AI News</Text>
        <Heading style={heading}>Ranking drop detected</Heading>
        <Text style={text}>
          {capturedOn
            ? `The ${capturedOn} ranking check found positions moving the wrong way:`
            : "The latest ranking check found positions moving the wrong way:"}
        </Text>
        <Section style={box}>
          {alerts.map((alert) => (
            <Text key={alert.keyword} style={item}>
              {describe(alert)}
            </Text>
          ))}
        </Section>
        <Hr style={hr} />
        <Text style={footnote}>
          Ranking data from Semrush. Open the Keyword Rankings dashboard in your admin area for
          the full history.
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email as TemplateEntry["component"],
  subject: "Keyword ranking drop — China AI News",
  displayName: "Keyword ranking alert",
  previewData: {
    capturedOn: "2026-08-16",
    alerts: [
      { keyword: "china ai news", from: 8, to: 14 },
      { keyword: "chinese ai models", from: 22, to: null },
    ],
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Georgia, 'Times New Roman', serif" };
const container = { padding: "32px 28px", maxWidth: "560px" };
const brand = {
  fontSize: "12px",
  letterSpacing: "1.5px",
  textTransform: "uppercase" as const,
  color: "#6b7280",
  margin: "0 0 12px",
};
const heading = { fontSize: "24px", color: "#111827", margin: "0 0 16px" };
const text = { fontSize: "15px", lineHeight: "1.6", color: "#374151" };
const box = {
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  padding: "12px 16px",
  margin: "16px 0",
};
const item = { fontSize: "15px", color: "#111827", margin: "6px 0" };
const hr = { borderColor: "#e5e7eb", margin: "24px 0 12px" };
const footnote = { fontSize: "12px", color: "#6b7280", lineHeight: "1.5" };
