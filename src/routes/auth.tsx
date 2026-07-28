import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Inside China AI" },
      { name: "description", content: "Admin sign in" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot" | "recovery" | "magic";

/** Extract the recovery token from a pasted Supabase email link. */
function extractTokenFromLink(pasted: string): string | null {
  try {
    const url = new URL(pasted.trim());
    // Format: https://xxx.supabase.co/auth/v1/verify?token=ABC&type=recovery
    const token = url.searchParams.get("token");
    if (token) return token;
  } catch {
    // Not a valid URL — maybe just the raw token
    if (pasted.trim().length > 10) return pasted.trim();
  }
  return null;
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetLink, setResetLink] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [loading, setLoading] = useState(false);

  // Detect password recovery redirect from Supabase hash
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("recovery");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  /* ---- Forgot password: send email ---- */
  async function handleSendResetEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      setEmailSent(true);
      toast.success("Reset email sent — check your inbox.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  /* ---- Forgot password: verify pasted link token ---- */
  async function handleVerifyLink(e: React.FormEvent) {
    e.preventDefault();
    const token = extractTokenFromLink(resetLink);
    if (!token) {
      toast.error("Could not find a token in that link. Paste the full link from the email.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: "recovery",
      });
      if (error) throw error;
      toast.success("Link verified — set your new password below.");
      setMode("recovery");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Verification failed: ${err.message}`
          : "Verification failed — the link may have expired. Request a new one.",
      );
    } finally {
      setLoading(false);
    }
  }

  /* ---- Recovery: set new password ---- */
  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated! You can now sign in.");
      await supabase.auth.signOut();
      setNewPassword("");
      setMode("signin");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  /* ---- Magic link: send sign-in link ---- */
  async function handleSendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/admin` },
      });
      if (error) throw error;
      setEmailSent(true);
      toast.success("Check your email for the sign-in link.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  /* ---- Sign in / Sign up ---- */
  async function handleSignInUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/admin` },
        });
        if (error) throw error;
        toast.success("Account created");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/admin" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  /* ---- Google sign-in ---- */
  async function signInGoogle() {
    setLoading(true);
    try {
      const isLocal =
        window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

      if (isLocal) {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/admin` },
        });
        if (error) throw error;
        return;
      }

      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate({ to: "/admin" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
      setLoading(false);
    }
  }

  /* ---- Render ---- */

  if (mode === "recovery") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-8 block text-center font-serif text-2xl">
            Inside China AI
          </Link>
          <div className="rounded-xl border border-border/70 bg-card p-8 shadow-sm">
            <h1 className="font-serif text-2xl">Set new password</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter a new password for your account
            </p>
            <form onSubmit={handleUpdatePassword} className="mt-6 space-y-3">
              <div>
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="mt-1"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Please wait…" : "Update password"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "magic") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-8 block text-center font-serif text-2xl">
            Inside China AI
          </Link>
          <div className="rounded-xl border border-border/70 bg-card p-8 shadow-sm">
            <h1 className="font-serif text-2xl">Email me a sign-in link</h1>
            {!emailSent ? (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  We'll send a one-tap sign-in link to your email. No password needed.
                </p>
                <form onSubmit={handleSendMagicLink} className="mt-6 space-y-3">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="mt-1"
                      autoFocus
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Sending…" : "Send sign-in link"}
                  </Button>
                </form>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Link sent to <strong>{email}</strong>. Open it on this device to sign in here.
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setEmailSent(false);
              }}
              className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-8 block text-center font-serif text-2xl">
            Inside China AI
          </Link>
          <div className="rounded-xl border border-border/70 bg-card p-8 shadow-sm">
            <h1 className="font-serif text-2xl">Reset password</h1>

            {!emailSent ? (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter your email — we'll send a password reset link
                </p>
                <form onSubmit={handleSendResetEmail} className="mt-6 space-y-3">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="mt-1"
                      autoFocus
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Please wait…" : "Send reset link"}
                  </Button>
                </form>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  Email sent! Now you need to <strong>copy</strong> the link from the email (don't
                  click it) and paste it below.
                </p>
                <form onSubmit={handleVerifyLink} className="mt-6 space-y-3">
                  <div>
                    <Label htmlFor="resetLink">Paste reset link from email</Label>
                    <Input
                      id="resetLink"
                      type="text"
                      value={resetLink}
                      onChange={(e) => setResetLink(e.target.value)}
                      placeholder="https://zjsjrghmhcmwvkfpbqap.supabase.co/auth/v1/verify?token=…"
                      required
                      className="mt-1 font-mono text-xs"
                      autoFocus
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Verifying…" : "Verify link"}
                  </Button>
                </form>
                <button
                  type="button"
                  onClick={() => {
                    setEmailSent(false);
                    setResetLink("");
                  }}
                  className="mt-3 w-full text-center text-sm text-muted-foreground hover:text-foreground"
                >
                  ← Use a different email
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setEmailSent(false);
                setResetLink("");
              }}
              className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  // signin / signup
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 block text-center font-serif text-2xl">
          Inside China AI
        </Link>
        <div className="rounded-xl border border-border/70 bg-card p-8 shadow-sm">
          <h1 className="font-serif text-2xl">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to the admin dashboard"
              : "The first account becomes admin"}
          </p>

          <Button
            type="button"
            variant="outline"
            className="mt-6 w-full"
            onClick={signInGoogle}
            disabled={loading}
          >
            Continue with Google
          </Button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span>or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSignInUp} className="space-y-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="mt-1"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
            </Button>
          </form>

          {mode === "signin" && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => {
                  setMode("magic");
                  setEmailSent(false);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                Email me a link instead
              </button>
              <button
                type="button"
                onClick={() => setMode("forgot")}
                className="text-muted-foreground hover:text-foreground"
              >
                Forgot password?
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            {mode === "signin" ? "No account? Sign up" : "Have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
