import * as React from "react";

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";

interface EmailChangeEmailProps {
  siteName: string;
  oldEmail: string;
  email: string;
  newEmail: string;
  confirmationUrl: string;
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email change for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Confirm your email change</Heading>
        <Text style={text}>
          You requested to change your email address for {siteName} from{" "}
          <Link href={`mailto:${oldEmail}`} style={link}>
            {oldEmail}
          </Link>{" "}
          to{" "}
          <Link href={`mailto:${newEmail}`} style={link}>
            {newEmail}
          </Link>
          .
        </Text>
        <Text style={text}>Click the button below to confirm this change:</Text>
        <Button style={button} href={confirmationUrl}>
          Confirm Email Change
        </Button>
        <Text style={footer}>
          If you didn't request this change, please secure your account immediately.
        </Text>
      </Container>
    </Body>
  </Html>
);

export default EmailChangeEmail;

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
const link = { color: "#3D3833", textDecoration: "underline" };
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
