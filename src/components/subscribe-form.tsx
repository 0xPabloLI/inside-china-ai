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
      <h3 className="font-serif text-2xl">Subscribe</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        One email a week. New writing on China's AI industry. Unsubscribe anytime.
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
    </div>
  );
}
