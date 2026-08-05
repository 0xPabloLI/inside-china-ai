import * as React from "react";

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";

interface MagicLinkEmailProps {
  siteName: string;
  confirmationUrl: string;
}

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your login link for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your login link</Heading>
        <Text style={text}>
          Click the button below to log in to {siteName}. This link will expire shortly.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Log In
        </Button>
        <Text style={footer}>
          If you didn't request this link, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
);

export default MagicLinkEmail;

const main = {
  backgroundColor: "#FAF9F7",
  fontFamily: '"Inter", Arial, sans-serif',
};
const container = {
  backgroundColor: "#FFFFFF",
  border: "1px solid #E8E4DF",
  borderRadius: "12px",
  padding: "32px",
  maxWidth: "480px",
};
const h1 = {
  fontFamily: '"Instrument Serif", Georgia, serif',
  fontSize: "28px",
  fontWeight: 400,
  color: "#2D2A26",
  margin: "0 0 24px",
};
const text = {
  fontSize: "15px",
  color: "#3D3833",
  lineHeight: "1.6",
  margin: "0 0 20px",
};
const button = {
  backgroundColor: "#3D3833",
  color: "#FAF9F7",
  fontSize: "15px",
  fontWeight: 500,
  borderRadius: "8px",
  padding: "14px 24px",
  textDecoration: "none",
  display: "inline-block",
};
const footer = { fontSize: "13px", color: "#6B6560", margin: "28px 0 0" };
