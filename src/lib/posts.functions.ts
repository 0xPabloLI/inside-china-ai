import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STORAGE_BUCKET = "post-attachments";

/** Build the public URL for a file in the post-attachments bucket. */
export function attachmentPublicUrl(storagePath: string): string {
  const url = process.env.SUPABASE_URL!;
  return `${url}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;
}

function publicClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const listPublishedPosts = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const { data, error } = await sb
    .from("posts")
    .select("id, title, slug, excerpt, published_at")
    .eq("published", true)
    .order("published_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const getPublishedPost = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: row, error } = await sb
      .from("posts")
      .select("id, title, slug, excerpt, content, published_at")
      .eq("slug", data.slug)
      .eq("published", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;

    // Fetch attachments for this post
    const { data: attachments, error: attErr } = await sb
      .from("post_attachments")
      .select("id, file_name, storage_path, file_size, mime_type, created_at")
      .eq("post_id", row.id)
      .order("created_at", { ascending: true });
    if (attErr) throw new Error(attErr.message);

    return {
      ...row,
      attachments: (attachments ?? []).map((a) => ({
        ...a,
        url: attachmentPublicUrl(a.storage_path),
      })),
    };
  });

// ---- Admin ----

const postInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug may contain lowercase letters, numbers and hyphens"),
  excerpt: z.string().trim().max(500).optional().nullable(),
  content: z.string().max(200000).default(""),
  published: z.boolean().default(false),
});

export const listAllPostsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { data, error } = await context.supabase
      .from("posts")
      .select("id, title, slug, published, published_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getPostAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("posts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const savePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => postInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const now = new Date().toISOString();
    if (data.id) {
      const { data: existing } = await context.supabase
        .from("posts")
        .select("published, published_at")
        .eq("id", data.id)
        .maybeSingle();
      const published_at =
        data.published && !existing?.published_at ? now : (existing?.published_at ?? null);
      const { data: row, error } = await context.supabase
        .from("posts")
        .update({
          title: data.title,
          slug: data.slug,
          excerpt: data.excerpt ?? null,
          content: data.content,
          published: data.published,
          published_at,
        })
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }

    const { data: row, error } = await context.supabase
      .from("posts")
      .insert({
        author_id: context.userId,
        title: data.title,
        slug: data.slug,
        excerpt: data.excerpt ?? null,
        content: data.content,
        published: data.published,
        published_at: data.published ? now : null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    // Gather attachment storage paths before deleting (CASCADE will remove rows)
    const { data: atts } = await context.supabase
      .from("post_attachments")
      .select("storage_path")
      .eq("post_id", data.id);
    if (atts && atts.length > 0) {
      const paths = atts.map((a) => a.storage_path);
      await context.supabase.storage.from(STORAGE_BUCKET).remove(paths);
    }

    const { error } = await context.supabase.from("posts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Attachments (Admin) ----

export const listAttachmentsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { postId: string }) => z.object({ postId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { data: rows, error } = await context.supabase
      .from("post_attachments")
      .select("id, post_id, file_name, storage_path, file_size, mime_type, created_at")
      .eq("post_id", data.postId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((a) => ({ ...a, url: attachmentPublicUrl(a.storage_path) }));
  });

export const deleteAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: row, error: fetchErr } = await context.supabase
      .from("post_attachments")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (row) {
      await context.supabase.storage.from(STORAGE_BUCKET).remove([row.storage_path]);
    }

    const { error: delErr } = await context.supabase
      .from("post_attachments")
      .delete()
      .eq("id", data.id);
    if (delErr) throw new Error(delErr.message);
    return { ok: true };
  });

export const renameAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; fileName: string }) =>
    z
      .object({
        id: z.string().uuid(),
        fileName: z.string().trim().min(1).max(255),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: row, error } = await context.supabase
      .from("post_attachments")
      .update({ file_name: data.fileName })
      .eq("id", data.id)
      .select("id, file_name")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
