// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://id-preview--11111111-1111-4111-8111-111111111111.lovable.app/" }
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { brokeredPreviewStorage } from "./previewAuthStorage";

// Seam under test: brokeredPreviewStorage() as seen by Supabase's storage
// adapter contract (getItem/setItem/removeItem), with the Lovable editor frame
// simulated over the real postMessage protocol. The preview host in the
// docblock URL puts the factory on the brokered path.

const EDITOR_ORIGIN = "https://lovable.dev";
const KEY = "sb-test-auth-token";

type Reply = { ok: boolean; value?: string | null } | null;

/** Stand-in for the Lovable editor parent frame: records every request the
 * storage sends and answers it on a microtask, the way the real editor does. */
function installEditorBroker(replyFor: (type: string, key: string, value?: string) => Reply) {
  const received: Array<{ type: string; key: string; value?: string }> = [];
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: {
      postMessage: (msg: { type: string; requestId: string; key: string; value?: string }) => {
        received.push({ type: msg.type, key: msg.key, value: msg.value });
        const reply = replyFor(msg.type, msg.key, msg.value);
        if (!reply) return;
        queueMicrotask(() => {
          window.dispatchEvent(
            new MessageEvent("message", {
              origin: EDITOR_ORIGIN,
              data: { type: "lovable-preview-auth:result", requestId: msg.requestId, ...reply },
            }),
          );
        });
      },
    },
  });
  return { received };
}

describe("brokeredPreviewStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    delete (window as unknown as { parent?: unknown }).parent;
  });

  it("mirrors the broker's canonical value back into localStorage after a set", async () => {
    localStorage.setItem(KEY, "client-value");
    const broker = installEditorBroker(() => ({ ok: true, value: "canonical-value" }));

    await brokeredPreviewStorage()?.setItem(KEY, "client-value");

    expect(broker.received).toEqual([
      { type: "lovable-preview-auth:set", key: KEY, value: "client-value" },
    ]);
    expect(localStorage.getItem(KEY)).toBe("canonical-value");
  });

  it("clears the local key when the broker answers with the logout tombstone", async () => {
    localStorage.setItem(KEY, "client-value");
    installEditorBroker(() => ({ ok: true, value: "" }));

    await brokeredPreviewStorage()?.setItem(KEY, "client-value");

    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("does not clobber a concurrent local write made while the broker was answering", async () => {
    localStorage.setItem(KEY, "client-value");
    installEditorBroker(() => {
      localStorage.setItem(KEY, "second-writer");
      return { ok: true, value: "canonical-value" };
    });

    await brokeredPreviewStorage()?.setItem(KEY, "client-value");

    expect(localStorage.getItem(KEY)).toBe("second-writer");
  });

  it("keeps the local value when the broker rejects the set", async () => {
    localStorage.setItem(KEY, "client-value");
    installEditorBroker(() => ({ ok: false }));

    await brokeredPreviewStorage()?.setItem(KEY, "client-value");

    expect(localStorage.getItem(KEY)).toBe("client-value");
  });
});
