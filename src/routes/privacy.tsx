import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — China AI News" },
      {
        name: "description",
        content:
          "How China AI News collects, stores, and uses newsletter subscriber emails, and how you can unsubscribe or request deletion at any time.",
      },
      { property: "og:title", content: "Privacy Policy — China AI News" },
      {
        property: "og:description",
        content: "How China AI News handles subscriber emails and personal data.",
      },
      { property: "og:url", content: "https://chinaai.news/privacy" },
    ],
    links: [{ rel: "canonical", href: "https://chinaai.news/privacy" }],
  }),
  component: PrivacyPage,
});


function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 pt-16 pb-24">
        <h1 className="font-serif text-4xl mb-8">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Last updated:{" "}
          {new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="font-serif text-2xl mb-3">1. Information We Collect</h2>
            <p className="text-muted-foreground">
              We collect the following information when you use our Service:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>
                <strong>Email address</strong> — when you subscribe to our newsletter
              </li>
              <li>
                <strong>Authentication data</strong> — when you log in to the admin area (managed by
                Supabase Auth)
              </li>
              <li>
                <strong>Usage data</strong> — aggregated, anonymized analytics about page views and
                engagement
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-2xl mb-3">2. How We Use Your Information</h2>
            <p className="text-muted-foreground">
              We use your information to: (a) send you our weekly newsletter; (b) improve our
              content and Service; (c) respond to your inquiries. We do not sell, rent, or share
              your email address with third parties for marketing purposes.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl mb-3">3. Third-Party Services</h2>
            <p className="text-muted-foreground">
              We use the following third-party services that may process your data:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>
                <strong>Supabase</strong> — authentication and database hosting
              </li>
              <li>
                <strong>TikTok</strong> — for publishing short-form video content (via Content
                Posting API)
              </li>
              <li>
                <strong>Lovable</strong> — website hosting and deployment
              </li>
            </ul>
            <p className="text-muted-foreground mt-2">
              Each service has its own privacy policy governing how they handle data. We encourage
              you to review their policies.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl mb-3">4. Cookies</h2>
            <p className="text-muted-foreground">
              The Service uses essential cookies for authentication and session management. We do
              not use tracking cookies for advertising. Essential cookies are necessary for the
              Service to function and cannot be disabled.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl mb-3">5. Data Retention</h2>
            <p className="text-muted-foreground">
              We retain your email address for as long as you are subscribed to our newsletter. You
              may request deletion of your data at any time by contacting us. Authentication data is
              managed by Supabase and retained according to their policies.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl mb-3">6. Your Rights</h2>
            <p className="text-muted-foreground">
              You have the right to: (a) access the personal data we hold about you; (b) request
              correction of inaccurate data; (c) request deletion of your data; (d) unsubscribe from
              our newsletter at any time.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl mb-3">7. Security</h2>
            <p className="text-muted-foreground">
              We take reasonable measures to protect your data using industry-standard security
              practices. However, no method of transmission over the internet is completely secure,
              and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl mb-3">8. Children's Privacy</h2>
            <p className="text-muted-foreground">
              The Service is not directed to children under 13. We do not knowingly collect personal
              information from children under 13. If you believe we have collected such information,
              please contact us.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl mb-3">9. Changes to This Policy</h2>
            <p className="text-muted-foreground">
              We may update this Privacy Policy from time to time. Changes will be posted on this
              page with an updated date. We encourage you to review this page periodically.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl mb-3">10. Contact</h2>
            <p className="text-muted-foreground">
              Questions about this Privacy Policy? Contact us at chinaai.news.
            </p>
          </section>
        </div>
      </main>
      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} · China AI News
      </footer>
    </div>
  );
}
