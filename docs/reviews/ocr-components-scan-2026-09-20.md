# OCR Scan Report: src/components (top-level)

**Date**: 2026-09-20
**Tool**: open-code-review v1.12.6
**Provider**: BigSong (gemma-4)
**Scope**: 16 top-level component files in src/components/
**Duration**: ~24 minutes
**Concurrency**: 2, --no-plan

## Summary

- **Total comments**: 20
- **High**: 1
- **Medium**: 8
- **Low**: 11

## Files with errors (rate-limited, not reviewed)

- src/components/ask-china-ai.tsx (context deadline exceeded)
- src/components/newsletter-admin.tsx (429 rate limit)
- src/components/ranking-alert-settings.tsx (429 rate limit)
- src/components/reading-progress.tsx (429 rate limit on retry)
- src/components/site-header.tsx (429 rate limit)
- src/components/tiktok-embed.tsx (429 rate limit)

## Findings

### 1. [HIGH] src/components/post-editor.tsx:70-83 (bug)

The `onSubmit` handler lacks error handling. If `onSave` throws an exception or rejects the promise, `setSaving(false)` will never be called, leaving the form in a permanent 'Saving...' state and disabling the buttons. It is recommended to use a `try...catch...finally` block.

**Suggestion:**
```
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await onSave({
            id: initial?.id,
            title: title.trim(),
            slug: effectiveSlug,
            excerpt: excerpt.trim(),
            content,
            published,
            tiktokUrl: tiktokUrl.trim(),
          });
        } catch (error) {
          console.error("Failed to save post:", error);
          toast.error("An error occurred while saving the post."
```


### 2. [MEDIUM] src/components/attachment-uploader.tsx:99-109 (performance)

Uploading large files (up to 50MB) by converting them to base64 strings and sending them in a JSON payload is inefficient. This increases the payload size by approximately 33% and can cause significant memory pressure on both the client and server. It may also trigger request size limits on the server or proxy (e.g., Nginx). 

It is highly recommended to use `FormData` and `multipart/form-data` for file uploads, which allows the file to be streamed.

**Suggestion:**
```
      const formData = new FormData();
      formData.append("postId", postId);
      formData.append("file", file);
      // Adjust uploadAtt to accept FormData instead of a JSON object
      await uploadAtt({ data: formData });
```


### 3. [MEDIUM] src/components/header-nav.tsx:33-88 (maintainability)

The link definitions are duplicated between `links` and `mobileLinks`. This makes the component harder to maintain as any change to the navigation structure (e.g., adding a new link) must be applied in two places. Consider extracting the link configuration into a constant array and mapping over it to render both desktop and mobile navigation.

**Suggestion:**
```
const NAV_LINKS = [
  { to: "/", label: "Articles", isArticles: true },
  { to: "/news", label: "News" },
  { to: "/companies", label: "Companies" },
  { to: "/ask", label: "Ask" },
] as const;

// Inside HeaderNav:
const renderLinks = (wrapWithSheetClose = false) => {
  const allLinks = [...NAV_LINKS];
  if (isAdmin) allLinks.push({ to: "/admin", label: "Admin" });

  return allLinks.map((link) => {
    const isActive = link.isArticles ? articlesActive(pathname) : pathname.startsWith(link.to);

```


### 4. [MEDIUM] src/components/markdown-editor.tsx:88-93 (bug)

The `insertBlock` function does not ensure that the inserted block is on its own line. If the cursor is at the start of a line or the start of the document, it simply prepends the block to the existing text, which can lead to invalid Markdown (e.g., inserting a horizontal rule `---` at the start of a line containing text results in `---Text` instead of the rule being on its own line). It should instead split the current line or ensure surrounding newlines.

**Suggestion:**
```
function insertBlock(ta: HTMLTextAreaElement, block: string, onChange: (v: string) => void) {
  const { selectionStart: start, value } = ta;
  
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = value.indexOf("\n", start);
  const actualLineEnd = lineEnd === -1 ? value.length : lineEnd;
  const currentLine = value.slice(lineStart, actualLineEnd);

  let newText;
  if (currentLine.trim() === "") {
    const before = value.slice(0, lineStart);
    const after = value.sli
```


### 5. [MEDIUM] src/components/reading-progress.tsx:41-41 (bug)

The JSDoc claims that the component respects 'prefers-reduced-motion' (transition disabled), but the transition is applied unconditionally. Use the 'motion-safe:' modifier to ensure the transition is only active for users who haven't enabled reduced motion.

**Suggestion:**
```
className="reading-progress-bar h-full bg-brand motion-safe:transition-[width] motion-safe:duration-75 motion-safe:ease-out"
```


### 6. [MEDIUM] src/components/reading-progress.tsx:42-42 (performance)

Updating the 'width' property on every scroll event triggers layout reflows, which can cause performance degradation (jank) especially on complex pages. It is highly recommended to use 'transform: scaleX()' combined with 'transform-origin: left', as transforms are handled by the compositor and do not trigger reflows.

**Suggestion:**
```
className="reading-progress-bar h-full w-full origin-left bg-brand motion-safe:transition-transform motion-safe:duration-75 motion-safe:ease-out"
style={{ transform: `scaleX(${progress / 100})` }}
```


### 7. [MEDIUM] src/components/social-preview-refresh.tsx:66-66 (bug)

The state 'raw' is initialized with the 'path' prop, but it will not update if the 'path' prop changes after the initial render. If the parent component updates the 'path', the input field and the generated URL will remain stale.

**Suggestion:**
```
  const [raw, setRaw] = useState(path);

  useEffect(() => {
    setRaw(path);
  }, [path]);
```


### 8. [MEDIUM] src/components/social-preview-refresh.tsx:85-90 (bug)

Calling 'window.open' in a loop will likely be blocked by browser popup blockers, as most browsers only allow one window to be opened per user interaction. This will result in only the first debugger opening and the rest being blocked.

**Suggestion:**
```
  const refreshAll = () => {
    // Note: Browsers often block multiple window.open calls. 
    // Consider informing the user to allow popups or opening them one by one.
    for (const d of DEBUGGERS) {
      window.open(d.href(url), "_blank", "noopener,noreferrer");
    }
    toast.success("Attempted to open all link debuggers. Please check your popup blocker.");
  };
```


### 9. [MEDIUM] src/components/theme-toggle.tsx:30-31 (maintainability)

The theme state is currently managed locally within the `ThemeToggle` component. If other parts of the application need to react to the current theme (e.g., for chart colors, specific image assets, or other UI components), they will have no way to access this state. It is recommended to move the theme state and logic into a `ThemeProvider` using React Context.

**Suggestion:**
```
// Create a ThemeContext and ThemeProvider to manage state globally
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  // ... move initialization and toggle logic here
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
```


### 10. [LOW] src/components/attachment-uploader.tsx:286-286 (bug)

The file name is inserted directly into a Markdown link without escaping. If the file name contains special characters like `]`, it will break the Markdown syntax.

Consider escaping `[` and `]` characters in `att.file_name`.

**Suggestion:**
```
                      onClick={() => {
                        const escapedName = att.file_name.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
                        onInsertLink(`[${escapedName}](${att.url})`);
                      }}
```


### 11. [LOW] src/components/attachment-uploader.tsx:132-135 (bug)

`navigator.clipboard.writeText` is an asynchronous operation that returns a Promise. Currently, the success toast is shown immediately regardless of whether the copy operation actually succeeded.

It should be awaited within a try-catch block to provide accurate feedback to the user.

**Suggestion:**
```
  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("URL copied to clipboard");
    } catch (e) {
      toast.error("Failed to copy URL to clipboard");
    }
  }
```


### 12. [LOW] src/components/confirm-dialog.tsx:26-26 (maintainability)

The `destructive` prop defaults to `true`. For a general-purpose `ConfirmDialog`, the default should typically be `false`. A "destructive" style (e.g., red button) should be an opt-in variant for high-risk actions (like deletion), whereas standard confirmations (like saving changes) should use the default theme.

**Suggestion:**
```
  destructive = false,
```


### 13. [LOW] src/components/confirm-dialog.tsx:52-55 (maintainability)

`onOpenChange(false)` is likely redundant here. In most UI libraries (such as Radix UI/shadcn which this component appears to use), `AlertDialogAction` automatically triggers the closing of the dialog, which in turn calls the `onOpenChange` callback of the `AlertDialog` component.

**Suggestion:**
```
            onClick={() => {
              onConfirm();
            }}
```


### 14. [LOW] src/components/header-nav.tsx:35-52 (maintainability)

URL paths are hardcoded directly in the JSX. According to the project guidelines, business-related hardcoded strings, especially URL paths, should be avoided. Consider moving these to a centralized configuration or constants file.

**Suggestion:**
```
// Define in a constants file
export const ROUTES = {
  HOME: "/",
  NEWS: "/news",
  COMPANIES: "/companies",
  ASK: "/ask",
  ADMIN: "/admin",
} as const;

// Use in component
<Link to={ROUTES.NEWS} ...>News</Link>
```


### 15. [LOW] src/components/post-editor.tsx:109-109 (maintainability)

The URL path `/posts/` is hardcoded in multiple places. It is recommended to define this as a constant or use a routing configuration to avoid inconsistencies and make it easier to update in the future.

**Suggestion:**
```
// Define a constant for the post path
const POST_PATH_PREFIX = "/posts";
// ...
        <p className="mt-1 text-xs text-muted-foreground">{`${POST_PATH_PREFIX}/${effectiveSlug || "..."}`}</p>
```


### 16. [LOW] src/components/markdown-editor.tsx:76-84 (maintainability)

The `if (selected)` and `else` blocks are identical. This redundant logic can be removed to simplify the code.

**Suggestion:**
```
    // Select the wrapped content or place cursor inside the placeholder
    ta.selectionStart = start + before.length;
    ta.selectionEnd = start + before.length + inner.length;
```


### 17. [LOW] src/components/reading-progress.tsx:29-29 (performance)

The 'scroll' event fires at a very high frequency. Updating React state on every event can lead to excessive re-renders and potentially block the main thread. Consider wrapping the state update in 'requestAnimationFrame' to throttle updates to the browser's refresh rate.

**Suggestion:**
```
let ticking = false;
const updateProgress = () => {
  if (!ticking) {
    window.requestAnimationFrame(() => {
      setProgress(
        calcReadingProgress(
          window.scrollY,
          document.documentElement.scrollHeight,
          window.innerHeight,
        ),
      );
      ticking = false;
    });
    ticking = true;
  }
};

updateProgress();
window.addEventListener("scroll", updateProgress, { passive: true });
```


### 18. [LOW] src/components/social-preview-refresh.tsx:164-164 (maintainability)

The business URL 'https://chinaai.news/…' is hardcoded. It should use the 'SITE_URL' constant to ensure consistency across environments.

**Suggestion:**
```
              <code>{SITE_URL}…</code> URL.
```


### 19. [LOW] src/components/theme-toggle.tsx:49-55 (other)

The placeholder rendered before mounting uses a hardcoded `<Sun />` icon. Since the final icon depends on the theme (`Sun` for dark, `Moon` for light), users in light mode will experience a visual flicker as the icon jumps from `Sun` to `Moon` after hydration. Consider using a neutral icon, a skeleton, or rendering nothing until mounted to improve UX.

**Suggestion:**
```
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Toggle theme">
        <div className="h-4 w-4 animate-pulse bg-muted-foreground/20 rounded-full" />
      </Button>
    );
  }
```


### 20. [LOW] src/components/theme-toggle.tsx:45-45 (bug)

Accessing `localStorage` can throw exceptions in certain environments (e.g., some browser privacy settings, incognito mode in older browsers, or if the storage quota is exceeded). It is safer to wrap `localStorage` calls in a try-catch block.

**Suggestion:**
```
    try {
      localStorage.setItem("theme", next);
    } catch (e) {
      console.error("Failed to save theme to localStorage", e);
    }
```


