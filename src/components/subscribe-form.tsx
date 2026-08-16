import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { subscribe } from "@/lib/subscribers.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const sub = useServerFn(subscribe);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await sub({ data: { email: email.trim() } });
      toast.success("Subscribed. New articles will arrive weekly.");
      setEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Subscription failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border/70 bg-card p-8 shadow-sm">
      <h2 className="font-serif text-2xl">Get notified</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        One email a week when new China AI news is published. Unsubscribe anytime.
      </p>
      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          required
          id="subscribe-email"
          aria-label="Email address"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={loading}>
          {loading ? "Subscribing…" : "Subscribe"}
        </Button>
      </form>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Rss className="h-3.5 w-3.5" aria-hidden="true" />
        Prefer a reader?{" "}
        <a
          href="/rss.xml"
          className="font-medium text-foreground underline underline-offset-2"
          target="_blank"
          rel="noopener noreferrer"
        >
          Subscribe via RSS
        </a>
      </p>
    </div>
  );
}
