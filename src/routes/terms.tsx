import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — China AI News" },
      {
        name: "description",
        content: "Terms of Service for China AI News.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 pt-16 pb-24">
        <h1 className="font-serif text-4xl mb-8">Terms of Service</h1>
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
            <h2 className="font-serif text-2xl mb-3">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground">
              By accessing or using China AI News ("we," "us," or "our") website at
              chinaai.lovable.app (the "Service"), you agree to be bound by these Terms of Service.
              If you do not agree, please do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl mb-3">2. Description of Service</h2>
            <p className="text-muted-foreground">
              China AI News is an independent publication providing news, analysis, and data about
              artificial intelligence in China. The Service includes articles, a subscriber email
              list, and short-form video content published on social media platforms.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl mb-3">3. User Accounts</h2>
            <p className="text-muted-foreground">
              You may subscribe to our email list by providing your email address. You are
              responsible for the accuracy of the information you provide. You may unsubscribe at
              any time using the link in our emails.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl mb-3">4. Content</h2>
            <p className="text-muted-foreground">
              All content published on the Service is owned by China AI News or used with
              permission. You may not reproduce, distribute, or create derivative works from our
              content without prior written consent. Fair use exceptions apply.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl mb-3">5. Acceptable Use</h2>
            <p className="text-muted-foreground">
              You agree not to: (a) use the Service for any unlawful purpose; (b) attempt to gain
              unauthorized access to our systems; (c) scrape, crawl, or otherwise systematically
              extract data from the Service; (d) interfere with the proper functioning of the
              Service.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl mb-3">6. Third-Party Services</h2>
            <p className="text-muted-foreground">
              The Service may integrate with third-party platforms including TikTok, YouTube, and
              email service providers. We are not responsible for the practices or content of these
              third-party services. Their respective terms govern your use of those platforms.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl mb-3">7. Disclaimers</h2>
            <p className="text-muted-foreground">
              The Service is provided "as is" without warranties of any kind. We do not guarantee
              the accuracy, completeness, or timeliness of information on the Service. Content is
              for informational purposes only and does not constitute professional advice.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl mb-3">8. Limitation of Liability</h2>
            <p className="text-muted-foreground">
              To the maximum extent permitted by law, China AI News shall not be liable for any
              indirect, incidental, special, consequential, or punitive damages arising from your
              use of the Service.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl mb-3">9. Changes to Terms</h2>
            <p className="text-muted-foreground">
              We may update these Terms from time to time. Changes will be posted on this page with
              an updated date. Continued use of the Service after changes constitutes acceptance of
              the new Terms.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl mb-3">10. Contact</h2>
            <p className="text-muted-foreground">
              Questions about these Terms? Contact us at chinaai.lovable.app.
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
