import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface NewsletterEmailProps {
  siteName?: string
  siteUrl?: string
  subject?: string
  title?: string
  excerpt?: string
  content?: string
  postUrl?: string
  publishedAt?: string
}

const NewsletterEmail = ({
  siteName = 'China AI News',
  siteUrl = 'https://chinaai.news',
  subject = 'Latest from China AI News',
  title,
  excerpt,
  content,
  postUrl,
  publishedAt,
}: NewsletterEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{subject}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={masthead}>
          <Link href={siteUrl} style={brandLink}>
            {siteName}
          </Link>
        </Section>

        <Heading style={h1}>{title || subject}</Heading>

        {publishedAt && (
          <Text style={date}>{publishedAt}</Text>
        )}

        {excerpt && <Text style={lead}>{excerpt}</Text>}

        {content && (
          <Section style={bodySection}>
            <Text style={bodyText}>{content}</Text>
          </Section>
        )}

        {postUrl && (
          <Section style={ctaSection}>
            <Button style={button} href={postUrl}>
              Read the full article
            </Button>
          </Section>
        )}

        <Text style={footer}>
          You're receiving this because you subscribed to{' '}
          <Link href={siteUrl} style={footerLink}>
            {siteName}
          </Link>
          . One email a week on China's AI industry.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: NewsletterEmail,
  subject: (data: Record<string, any>) =>
    data.subject || data.title || 'Latest from China AI News',
  displayName: 'Weekly Newsletter',
  previewData: {
    siteName: 'China AI News',
    siteUrl: 'https://chinaai.news',
    subject: "DeepSeek's next move, Alibaba Qwen 3, and ByteDance Seed",
    title: "DeepSeek's next move, Alibaba Qwen 3, and ByteDance Seed",
    excerpt:
      'This week: leaked investor notes from DeepSeek, Alibaba open-sources Qwen 3, and ByteDance Seed ships a new video model.',
    content:
      'China AI News tracks the labs, startups, and policy shifts shaping the Chinese AI landscape. Here is what mattered this week.',
    postUrl: 'https://chinaai.news/posts/weekly-roundup',
    publishedAt: 'August 3, 2026',
  },
} satisfies TemplateEntry

export default NewsletterEmail

const main = {
  backgroundColor: '#FAF9F7',
  fontFamily: '"Inter", Arial, sans-serif',
}
const container = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #E8E4DF',
  borderRadius: '12px',
  padding: '32px',
  maxWidth: '560px',
}
const masthead = {
  marginBottom: '24px',
  paddingBottom: '16px',
  borderBottom: '1px solid #E8E4DF',
}
const brandLink = {
  fontFamily: '"Instrument Serif", Georgia, serif',
  fontSize: '22px',
  color: '#2D2A26',
  textDecoration: 'none',
}
const h1 = {
  fontFamily: '"Instrument Serif", Georgia, serif',
  fontSize: '30px',
  fontWeight: 400,
  color: '#2D2A26',
  margin: '0 0 16px',
  lineHeight: '1.25',
}
const date = {
  fontSize: '13px',
  color: '#6B6560',
  margin: '0 0 20px',
}
const lead = {
  fontSize: '16px',
  color: '#3D3833',
  lineHeight: '1.6',
  margin: '0 0 24px',
}
const bodySection = {
  marginBottom: '24px',
}
const bodyText = {
  fontSize: '15px',
  color: '#3D3833',
  lineHeight: '1.7',
  margin: '0 0 16px',
}
const ctaSection = {
  margin: '32px 0',
}
const button = {
  backgroundColor: '#3D3833',
  color: '#FAF9F7',
  fontSize: '15px',
  fontWeight: 500,
  borderRadius: '8px',
  padding: '14px 24px',
  textDecoration: 'none',
  display: 'inline-block',
}
const footer = {
  fontSize: '13px',
  color: '#6B6560',
  margin: '32px 0 0',
  paddingTop: '24px',
  borderTop: '1px solid #E8E4DF',
}
const footerLink = { color: '#3D3833', textDecoration: 'underline' }
