# OCR Scan Report: src/integrations/supabase

**Date**: 2026-09-20
**Tool**: open-code-review v1.12.6
**Provider**: BigSong (gemma-4)
**Scope**: 8 files in src/integrations/supabase/ (1 test file filtered)
**Duration**: ~13 minutes
**Concurrency**: 2, --no-plan

## Summary

- **Total comments**: 7
- **Critical**: 1
- **Medium**: 2
- **Low**: 4

## Files with errors (rate-limited, not reviewed)

- src/integrations/supabase/types.ts (429 rate limit)

## Findings

### 1. [CRITICAL] src/integrations/supabase/auth-middleware.ts:88-88 (bug)

The method `supabase.auth.getClaims(token)` is not a standard `@supabase/supabase-js` library method. This will cause a runtime `TypeError` and breaks subsequent logic relying on `data.claims`. Furthermore, if this is a custom implementation that decodes the JWT without verifying its signature, it creates a critical security vulnerability. Use `supabase.auth.getUser(token)` to ensure the token is cryptographically verified and to retrieve the user ID.

**Suggestion:**
```
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      throw new Error("Unauthorized: Invalid token");
    }
```


### 2. [MEDIUM] src/integrations/supabase/auth-attacher.ts:9-10 (bug)

Potential null pointer exception. `supabase.auth.getSession()` returns a response where `data` can be `null`. Accessing `data.session` without a null check on `data` may cause the application to crash if the session retrieval fails.

**Suggestion:**
```
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
```


### 3. [MEDIUM] src/integrations/supabase/previewAuthStorage.ts:26-26 (bug)

Creating a `new URL()` from `document.referrer` can throw a `TypeError` if the referrer is not a valid absolute URL. This could cause the entire `brokeredPreviewStorage` initialization to fail. It is safer to wrap this in a try-catch block.

**Suggestion:**
```
const getReferrerOrigin = () => {
  try {
    return document.referrer ? new URL(document.referrer).origin : '';
  } catch {
    return '';
  }
};
const ancestor = (location.ancestorOrigins && location.ancestorOrigins[0]) || getReferrerOrigin();
```


### 4. [LOW] src/integrations/supabase/auth-attacher.ts:8-9 (bug)

Missing error handling for async operation. The `supabase.auth.getSession()` call is not wrapped in a try-catch block, nor is the returned `error` object handled, which violates the async handling standards. Since this is a middleware, an unhandled exception could disrupt the request flow.

**Suggestion:**
```
  async ({ next }) => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("Supabase session error:", error);
      }
      const token = data?.session?.access_token;
      return next({
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch (err) {
      console.error("Unexpected error attaching auth:", err);
      return next({});
    }
  },
```


### 5. [LOW] src/integrations/supabase/previewAuthStorage.ts:27-29 (maintainability)

Nested ternary expressions are prohibited according to the project's code quality rules. Please refactor this to use an if-else block or separate variables for better readability.

**Suggestion:**
```
let editorOrigins: string[];
if (ancestor && EDITOR.test(ancestor)) {
  editorOrigins = [ancestor];
} else {
  editorOrigins = dev ? ['https://lovable.dev', 'http://localhost:3000'] : ['https://lovable.dev'];
}
```


### 6. [LOW] src/integrations/supabase/previewAuthStorage.ts:79-86 (maintainability)

Prefer `async/await` over `.then()` for handling promises to maintain consistency with the project's async handling standards.

**Suggestion:**
```
    setItem: async (key: string, value: string) => {
      localStorage.setItem(key, value);
      await request('lovable-preview-auth:set', key, value);
    },
    removeItem: async (key: string) => {
      localStorage.removeItem(key);
      await request('lovable-preview-auth:remove', key);
    },
```


### 7. [LOW] src/integrations/supabase/public-client.ts:17-18 (maintainability)

Using non-null assertions (`!`) for environment variables can lead to cryptic runtime errors or unexpected behavior (e.g., sending "undefined" as an API key) if the variables are missing. It is safer to perform an explicit null check and throw a descriptive error.

**Suggestion:**
```
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Missing required Supabase environment variables: SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");
  }
```


