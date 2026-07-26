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
      toast.success("订阅成功,期待每周与你相见。");
      setEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "订阅失败,请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border/70 bg-card p-8 shadow-sm">
      <h3 className="font-serif text-2xl">订阅新文章</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        每周一次,把这里新写的东西寄给你。随时可以退订。
      </p>
      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={loading}>
          {loading ? "订阅中…" : "订阅"}
        </Button>
      </form>
    </div>
  );
}
