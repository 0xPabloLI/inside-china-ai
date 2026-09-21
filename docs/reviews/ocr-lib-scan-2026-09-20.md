# OCR Scan Report: src/lib

**Date**: 2026-09-20
**Tool**: open-code-review v1.12.6
**Provider**: BigSong (gemma-4)
**Scope**: 33 files in src/lib/ (2 test files filtered)
**Duration**: ~41 minutes
**Concurrency**: 2, --no-plan

## Summary

- **Total comments**: 53
- **Critical**: 3
- **High**: 7
- **Medium**: 24
- **Low**: 19

## Findings

### 1. [CRITICAL] src/lib/error-capture.ts:4-4 (other)

`lastCapturedError` is a module-level global variable. In a concurrent server environment (e.g., Node.js handling multiple requests), this variable is shared across all requests. If multiple requests encounter errors simultaneously, the last one to call `record()` will overwrite the value, causing `

### 2. [CRITICAL] src/lib/keyword-tracking.functions.ts:215-222 (bug)

Passing `id: true` in the `upsert` object is likely a bug. The `id` column of a table is typically an integer or a UUID, and passing a boolean `true` will either cause a database type error or insert an incorrect value. If this is a singleton settings table, it should use a specific constant ID (e.g

### 3. [CRITICAL] src/lib/newsletters.server.ts:123-125 (performance)

This loop performs an individual database update for every subscriber, creating an N+1 query problem. This will be prohibitively slow and put unnecessary load on the database. Use a single bulk update instead.

### 4. [HIGH] src/lib/keyword-tracking.functions.ts:62-70 (bug)

The `.limit(2000)` call applies a global limit to the entire result set across all keywords. Since the results are ordered by `captured_on` descending, if some keywords have many recent snapshots, they may occupy all 2000 slots, causing other keywords to have no snapshots returned even if they exist

### 5. [HIGH] src/lib/keyword-tracking.server.ts:76-96 (performance)

N+1 Query Problem: The code performs a `select` and an `upsert` for every single keyword inside a loop. This will lead to significant performance degradation as the number of tracked keywords grows and may cause timeouts in serverless environments. 

Suggestions:
1. Batch the `upsert` calls by colle

### 6. [HIGH] src/lib/newsletters.server.ts:42-45 (performance)

Fetching all active subscribers into memory at once can lead to memory exhaustion (OOM) as the subscriber list grows. Use pagination or a cursor-based approach to process subscribers in batches.

### 7. [HIGH] src/lib/newsletters.server.ts:63-65 (performance)

Sending emails sequentially in a loop can be extremely slow for large subscriber lists and may lead to request timeouts in serverless environments. Consider processing emails in parallel with a concurrency limit (e.g., using a batching strategy) or offloading this to a background job queue.

### 8. [HIGH] src/lib/posts.functions.ts:176-176 (security)

The `fileBase64` field has no maximum length constraint in the Zod schema. This could allow an attacker to send an extremely large string, leading to memory exhaustion (DoS) when `Buffer.from(data.fileBase64, "base64")` is called.

### 9. [HIGH] src/lib/semrush.server.ts:15-28 (bug)

The `normalizeRows` function lacks sufficient safety checks. If `data.rows` is not an array, `rows.map` will throw an error. Additionally, if an individual `row` is `null` or `undefined`, `Object.entries(obj)` will throw a TypeError.

### 10. [HIGH] src/lib/structured-data.ts:96-98 (security)

The `jsonLdScript` function uses `JSON.stringify(doc)` to generate the content for a script tag. If `doc` contains user-controlled strings (e.g., article headlines or descriptions), an attacker could inject the `</script>` sequence to terminate the JSON-LD block and initiate a new `<script>` block, 

### 11. [MEDIUM] src/lib/article-og-image.ts:62-67 (bug)

`new Date(value)` can return an 'Invalid Date' object if the input string is not a valid date. Calling `toLocaleDateString` on an invalid date returns the string "Invalid Date", which would then be rendered in the OG image. Suggest adding a check to ensure the date is valid before formatting.

### 12. [MEDIUM] src/lib/ask-retrieval.server.ts:126-132 (performance)

`bestPassage` is a computationally expensive function (it iterates through the content in windows and performs multiple string searches). Currently, it is called for every post that matches at least one term before the results are sorted and limited. It should be called only for the final top `limit

### 13. [MEDIUM] src/lib/ask-retrieval.server.ts:99-101 (bug)

The retrieval process is limited to the 100 most recent published posts (`.limit(100)`). This means any relevant information in older posts will be completely ignored, which is likely a defect for a grounded Q&A system that should search the entire knowledge base. If the dataset is large, consider u

### 14. [MEDIUM] src/lib/ask.server.ts:8-13 (maintainability)

Business-related constants such as GATEWAY_URL, MODEL, and rate limits (HOURLY_LIMIT, DAILY_LIMIT) are hardcoded. These should be moved to environment variables or a configuration file to allow for easier updates across different environments without requiring code changes.

### 15. [MEDIUM] src/lib/ask.server.ts:86-86 (bug)

Calling `.toISOString()` on a `Date` object created from an invalid date string will throw a `RangeError`. Since `s.publishedAt` comes from an external source, it should be validated before calling `.toISOString()`.

### 16. [MEDIUM] src/lib/error-capture.ts:56-63 (maintainability)

Overriding `console.error` to call `record()` means that any error logged by any library or internal logic will overwrite `lastCapturedError`. This makes the recovery mechanism in `server.ts` fragile, as a non-critical error logged via `console.error` could replace the actual crash error that needs 

### 17. [MEDIUM] src/lib/error-capture.ts:65-70 (bug)

The use of `globalThis.addEventListener` for `"error"` and `"unhandledrejection"` is specific to browser environments. In a Node.js environment (suggested by the mentions of `h3` and `server.ts`), these events are handled via `process.on('uncaughtException')` and `process.on('unhandledRejection')`. 

### 18. [MEDIUM] src/lib/email-templates/send-email.ts:9-15 (maintainability)

Business-related configuration (SITE_NAME, SENDER_DOMAIN, FROM_DOMAIN) is hardcoded. These should be moved to environment variables to allow for different configurations across environments (e.g., staging vs production) and to comply with the project's hardcoding policy.

### 19. [MEDIUM] src/lib/email-templates/send-email.ts:79-79 (bug)

The environment variable `LOVABLE_SEND_URL` is used without validation. If it is missing, the `sendLovableEmail` call may fail with an unclear error. It should be validated at the start of the function, similar to `LOVABLE_API_KEY`.

### 20. [MEDIUM] src/lib/format.ts:3-3 (bug)

The check `if (!bytes)` will return `"—"` when `bytes` is `0`. Since `0` is a valid file size, it should be formatted as `"0 B"` instead of being treated as a missing value. Suggest checking for `null` explicitly.

### 21. [MEDIUM] src/lib/keyword-tracking.server.ts:70-73 (bug)

Potential case-sensitivity bug: the map `byKeyword` is created using `m.keyword` as the key, but lookups are performed using `k.keyword.toLowerCase()`. If `m.keyword` contains any uppercase letters, the lookup will fail even if the keywords match.

### 22. [MEDIUM] src/lib/keyword-tracking.server.ts:137-141 (performance)

N+1 Query Problem: `getUserById` is called inside a loop for every admin user. If the number of admins grows, this will be inefficient. Consider if admin emails can be retrieved via a join in the initial `user_roles` query or by using a bulk user retrieval method if available.

### 23. [MEDIUM] src/lib/news-topics.ts:128-128 (bug)

Using `.includes()` for keyword matching can lead to false positives because it performs a substring match. For example, the keyword "law" will match "flawless" or "lawyer", and "ban" will match "abandon". It is recommended to use a regular expression with word boundaries (`\b`) to ensure only whole

### 24. [MEDIUM] src/lib/newsletters.functions.ts:42-50 (bug)

The update operation does not check if any row was actually updated. If the newsletter's status is not in ["draft", "scheduled", "failed"] (e.g., it's already "sent"), the update will silently fail to modify any row, but the function will still return { id: data.id } as if the update succeeded. Sugg

### 25. [MEDIUM] src/lib/newsletters.functions.ts:32-41 (bug)

The 'created_by' field is included in the 'row' object used for both insertions and updates. This causes the original creator's ID to be overwritten by the current user's ID whenever the newsletter is updated. Suggest moving 'created_by' to the insertion logic only.

### 26. [MEDIUM] src/lib/newsletters.server.ts:106-108 (other)

Inserting a very large array of logs in a single request may exceed the maximum number of parameters allowed by the database (e.g., PostgreSQL's limit) or the maximum request size of the API. Consider inserting logs in smaller chunks.

### 27. [MEDIUM] src/lib/og.ts:42-42 (bug)

The og:image:type is hardcoded to "image/png", but some of the fallback images (OG_DEFAULT, OG_COMPARE, OG_TIKTOK) are JPEGs. This can lead to incorrect metadata. Consider determining the mime type based on the image URL extension.

### 28. [MEDIUM] src/lib/posts.functions.ts:170-176 (security)

The `fileSize` check relies on a value provided by the client. A malicious user could provide a small `fileSize` value while sending a very large `fileBase64` string, bypassing the 50MB limit. The actual size of the decoded buffer should be verified.

### 29. [MEDIUM] src/lib/posts.functions.ts:155-158 (bug)

The return value of `storage.remove()` is ignored. If the file deletion from storage fails, the database record is still deleted, resulting in orphaned files in the storage bucket.

### 30. [MEDIUM] src/lib/semrush.server.ts:8-8 (maintainability)

The `GATEWAY_URL` is hardcoded. According to the project guidelines, business-related hardcoded strings, especially URL paths, are prohibited. This should be moved to an environment variable.

### 31. [MEDIUM] src/lib/semrush.server.ts:121-125 (performance)

The `phrase_these` endpoint typically has a limit on the number of keywords that can be requested in a single call (often 100). Additionally, joining a large number of keywords into a single query string may exceed the maximum URL length limit. Consider chunking the `wanted` keywords into smaller ba

### 32. [MEDIUM] src/lib/structured-data.ts:11-13 (maintainability)

Business-related URL paths like `SITE`, `ORG_ID`, and `LOGO` are hardcoded. It is recommended to move these to a configuration file or environment variables (e.g., `process.env.SITE_URL`) to avoid hardcoding and facilitate environment-specific configurations (e.g., staging vs. production).

### 33. [MEDIUM] src/lib/slug.ts:12-13 (bug)

The slugify function can produce slugs with leading or trailing hyphens (e.g., if the input starts/ends with hyphens or characters that are converted to hyphens). Additionally, slicing the string to 80 characters might leave a trailing hyphen if the 80th character is a hyphen. It is recommended to r

### 34. [MEDIUM] src/lib/subscribers.functions.ts:14-14 (maintainability)

Checking for 'duplicate' in the error message is fragile as it depends on the specific string returned by the database/API, which may change across versions or locales. It is recommended to use the error code (e.g., Postgres error code '23505' for unique violations) provided by Supabase/PostgREST.

### 35. [LOW] src/lib/article-og-image.ts:82-83 (maintainability)

Hardcoded dimensions and values (e.g., '1200', '630', '940') are used instead of constants. Use constants to ensure consistency and avoid magic numbers.

### 36. [LOW] src/lib/ask-retrieval.server.ts:120-120 (maintainability)

The code contains several hardcoded business numbers and magic numbers (e.g., scoring weights 6, 3, 8; term limit 24; occurrence limit 50; window step 350). These should be extracted into named constants to improve readability and maintainability.

### 37. [LOW] src/lib/ask.server.ts:73-81 (maintainability)

The SYSTEM_PROMPT is a large, business-critical string hardcoded in the source file. Moving this to a separate configuration file or a CMS would make prompt engineering and updates easier without modifying the logic.

### 38. [LOW] src/lib/error-capture.ts:21-21 (style)

Using `!=` is prohibited by the project guidelines. Use strict equality `!==` instead.

### 39. [LOW] src/lib/email-templates/send-email.ts:60-61 (performance)

The `render` function from `@react-email/render` is synchronous. Using `await` here is redundant. If it were asynchronous, these calls should be parallelized using `Promise.all` to avoid sequential blocking.

### 40. [LOW] src/lib/format.ts:6-6 (maintainability)

The function only supports units up to MB. For file sizes 1 GB or larger, it will continue to display them in MB (e.g., "1024.0 MB", "2048.0 MB"), which is not ideal for human readability. Suggest implementing a loop or a list of units (KB, MB, GB, TB, etc.) to handle larger sizes.

### 41. [LOW] src/lib/lovable-error-reporting.ts:46-51 (maintainability)

Nested ternary expressions are not allowed. Please refactor this logic into an if-else block or a separate helper function for better readability.

### 42. [LOW] src/lib/keyword-tracking.server.ts:2-2 (maintainability)

The domain is hardcoded. Business-related constants like this should ideally be moved to environment variables (e.g., `process.env.TRACKING_DOMAIN`) to allow for easier configuration across different environments.

### 43. [LOW] src/lib/news-topics.ts:8-18 (maintainability)

`TopicId` and `TOPICS` are manually synchronized. If a new topic is added to the `TOPICS` array but not to the `TopicId` union type, it may lead to type inconsistencies. Consider using `as const` on the `TOPICS` array and deriving the `TopicId` type from it.

### 44. [LOW] src/lib/news-topics.ts:134-136 (maintainability)

`countByTopic` returns a `Record<string, number>` that only contains keys for topics that have at least one matching post (plus the "all" key). This may cause the UI to receive `undefined` for topics with zero posts. It is safer to initialize all topic counts to 0.

### 45. [LOW] src/lib/newsletters.functions.ts:71-81 (maintainability)

The validator for 'previewNewsletter' is almost a duplicate of 'newsletterInput' but is less strict (missing .trim() and .url() validation). This duplication is hard to maintain and can lead to inconsistencies between what can be previewed and what can be saved. Suggest deriving this schema from 'ne

### 46. [LOW] src/lib/newsletters.functions.ts:100-102 (maintainability)

The list of newsletter sends is limited to 500 records without any pagination mechanism. As the number of sends grows, older records will become inaccessible. Suggest implementing pagination (e.g., using .range()).

### 47. [LOW] src/lib/og.ts:5-5 (maintainability)

The SITE_URL is hardcoded. It is recommended to use an environment variable (e.g., process.env.NEXT_PUBLIC_SITE_URL) to allow different URLs for different environments (development, staging, production).

### 48. [LOW] src/lib/posts.functions.ts:9-12 (maintainability)

Using the non-null assertion operator `!` on `process.env.SUPABASE_URL` will cause the application to crash with a `TypeError` if the environment variable is missing. It is safer to provide a fallback or throw a descriptive configuration error.

### 49. [LOW] src/lib/subscribers.functions.ts:15-15 (security)

Throwing raw database error messages to the client can leak sensitive information about the database schema or internal implementation (e.g., constraint names). Consider using a generic error message for the user and logging the detailed error on the server.

### 50. [LOW] src/lib/subscribers.functions.ts:25-26 (performance)

The `listSubscribers` function fetches all subscribers without pagination. As the subscriber list grows, this could lead to performance degradation and high memory usage. Consider implementing pagination using `.range()`.

### 51. [LOW] src/lib/email-templates/email-change.tsx:15-22 (maintainability)

The 'email' property is defined in the 'EmailChangeEmailProps' interface but is not used within the 'EmailChangeEmail' component. It should be removed to avoid confusion and keep the interface clean.

### 52. [LOW] src/lib/email-templates/newsletter.tsx:27-30 (maintainability)

Business-related strings such as 'siteName', 'siteUrl', and 'subject' are hardcoded as default values. These should be moved to a configuration file or environment variables to improve maintainability and allow for easier updates across different environments or sites.

### 53. [LOW] src/lib/email-templates/recovery.tsx:1-1 (maintainability)

The `React` import is not used anywhere in the file. In React 17+, the new JSX transform removes the need to import React for JSX. If the project uses React 17 or newer, this import can be removed.

