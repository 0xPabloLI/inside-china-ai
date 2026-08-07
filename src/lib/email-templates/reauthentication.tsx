import * as React from "react";

import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";

interface ReauthenticationEmailProps {
  token: string;
  [key: string]: unknown;
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Confirm reauthentication</Heading>
        <Text style={text}>Use the code below to confirm your identity:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          This code will expire shortly. If you didn't request this, you can safely ignore this
          email.
        </Text>
      </Container>
    </Body>
  </Html>
);

export default ReauthenticationEmail;

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
const codeStyle = {
  fontFamily: "Courier, monospace",
  fontSize: "28px",
  fontWeight: "bold" as const,
  color: "#2D2A26",
  margin: "0 0 30px",
};
const footer = { fontSize: "13px", color: "#6B6560", margin: "28px 0 0" };
