# OCR Code Review: src/routes

> 2026-09-19 | ocr scan --path src/routes | 31 files | 11 comments | 50m7s | qwen3:8b on Ollama

## Summary

- files_reviewed: 31
- comments: 11
- total_tokens: 115755
- elapsed: 50m7s

## Findings

### 1. [medium/performance] src/routes/api/public/hooks/dispatch-newsletters.ts:20

Missing try/catch block around async operation could cause unhandled rejections and server crashes.

**Existing:**
```
const result = await dispatchDueNewsletters();
```

**Suggestion:**
```
try {
  const result = await dispatchDueNewsletters();
  return Response.json({ ok: true, ...result });
} catch (error) {
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
```

---

### 2. [high/security] src/routes/api/public/hooks/dispatch-newsletters.ts:0

The fallback to SUPABASE_ANON_KEY when SUPABASE_PUBLISHABLE_KEY is missing exposes the cron endpoint to lower-privilege keys. This allows unauthorized access to a sensitive admin endpoint.

**Existing:**
```
const expected = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
```

**Suggestion:**
```
const expected = process.env["SUPABASE_PUBLISHABLE_KEY"]; if (!expected) {
  return Response.json({ error: "Missing required API key" }, { status: 401 });
}
```

---

### 3. [medium/performance] src/routes/api/public/health.ts:0

Missing error handling in async GET handler. Potential crashes if JSON.stringify or Response creation fails.

**Existing:**
```
async () =>
        new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" }
        })
```

**Suggestion:**
```
async () => {
  try {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Health check error:", error);
    return new Response(JSON.stringify({ status: "error", message: "Internal server err
```

---

### 4. [medium/maintainability] src/routes/api/public/health.ts:0

Hardcoded URL path '/api/public/health' violates business-related URL path hardcoding restrictions. Consider using a configuration variable or environment variable for this endpoint.

**Existing:**
```
createFileRoute("/api/public/health")
```

**Suggestion:**
```
createFileRoute(
  process.env.HEALTH_CHECK_PATH || "/api/public/health"
)
```

---

### 5. [medium/other] src/routes/compare.deepseek-vs-qwen-vs-glm-4.tsx:9

Hardcoded business URL path '/compare/deepseek-vs-qwen-vs-glm' violates the rule against hardcoding critical strings. Use a configuration variable or function to manage this path instead.

**Existing:**
```
  throw redirect({
    to: "/compare/deepseek-vs-qwen-vs-glm",
    statusCode: 301,
  });
```

**Suggestion:**
```
  const LEGACY_COMPARE_PATH = '/compare/deepseek-vs-qwen-vs-glm';
  throw redirect({
    to: LEGACY_COMPARE_PATH,
    statusCode: 301,
  });
```

---

### 6. [high/security] src/routes/terms.tsx:20

Hardcoded business URL detected in meta tags. This violates the guideline prohibiting hardcoded business paths/strings.

**Existing:**
```
    links: [{ rel: "canonical", href: "https://chinaai.news/terms" }],
  }),
  component: TermsPage,
});
```

**Suggestion:**
```
    links: [{ rel: "canonical", href: "https://chinaai.news/terms" }],
  }),
  component: TermsPage,
});
```

---

### 7. [medium/bug] src/routes/news.tsx:9

The `catch('all')` in the `searchSchema` may not handle missing topics correctly. Use `.default('all')` instead to set a fallback value when the topic is missing.

**Existing:**
```
  topic: z.enum(["all", "models", "policy", "chips", "companies", "industry"]).catch("all"),
```

**Suggestion:**
```
  topic: z.enum(["all", "models", "policy", "chips", "companies", "industry"]).default("all"),
```

---

### 8. [medium/maintainability] src/routes/terms.tsx:0

Client-side date generation exposes potential timing information leakage. Use server-side date or static date instead.

**Existing:**
```
        <p className="text-sm text-muted-foreground mb-8">
          Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
```

**Suggestion:**
```
        <p className="text-sm text-muted-foreground mb-8">
          Last updated: {"2026-09-19"}</p>
```

---

### 9. [medium/security] src/routes/widgets.$name.tsx:0

Potential XSS risk in `data-widget` attribute if `name` is not properly sanitized. Consider escaping user-controlled input.

**Existing:**
```
      <div
        data-widget={name}
        className={`my-10 rounded-lg border border-border/60 bg-card px-4 py-5 sm:px-6 sm:py-6 {
          isBreakout ? "max-w-none" : "max-w-prose"
        }`}
 
```

**Suggestion:**
```
      <div
        data-widget={encodeURIComponent(name)}
        className={`my-10 rounded-lg border border-border/60 bg-card px-4 py-5 sm:px-6 sm:py-6 {
          isBreakout ? "max-w-none" : "max-w-prose"
        }`}
      >
```

---

### 10. [low/maintainability] src/routes/widgets.$name.tsx:54

Consider extracting the widget rendering logic into a separate component for better reusability and readability.

**Existing:**
```
          <Widget />
        </Suspense>
```

**Suggestion:**
```
          <WidgetRenderer widget={Widget} isBreakout={isBreakout} />
        </Suspense>
```

---

### 11. [medium/security] src/routes/widgets.$name.tsx:38

Potential XSS risk in heading text. Ensure `name` is properly escaped before rendering.

**Existing:**
```
      <h1 className="mt-2 font-serif text-2xl leading-tight">{name}</h1>
```

**Suggestion:**
```
      <h1 className="mt-2 font-serif text-2xl leading-tight">{encodeURIComponent(name)}</h1>
```

---
