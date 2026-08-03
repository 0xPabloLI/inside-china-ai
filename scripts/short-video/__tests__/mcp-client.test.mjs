import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callMcpTool } from "../lib/mcp-client.mjs";
import { spawn } from "child_process";
import { EventEmitter } from "events";

// ─── Mock child_process.spawn ───

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

// ─── Helper: create mock child process ───

function createMockChild() {
  const child = new EventEmitter();
  child.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 12345;
  child.kill = vi.fn();
  return child;
}

// ─── Helper: simulate JSON-RPC response ───

function sendJsonRpc(child, id, result) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n";
  child.stdout.emit("data", Buffer.from(msg));
}

function sendJsonRpcError(child, id, error) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, error }) + "\n";
  child.stdout.emit("data", Buffer.from(msg));
}

// ─── Tests ───

describe("callMcpTool", () => {
  let mockChild;

  beforeEach(() => {
    mockChild = createMockChild();
    spawn.mockReturnValue(mockChild);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns success when MCP server responds with result", async () => {
    const promise = callMcpTool({
      command: "python",
      args: ["-m", "test_server"],
      toolName: "search",
      toolArgs: { keyword: "AI" },
      timeoutMs: 5000,
    });

    // Wait for initialize to be sent
    await new Promise((r) => setTimeout(r, 10));

    // Respond to initialize (id=1)
    sendJsonRpc(mockChild, 1, { protocolVersion: "2024-11-05", capabilities: {} });
    await new Promise((r) => setTimeout(r, 10));

    // Respond to tools/call (id=2)
    sendJsonRpc(mockChild, 2, { content: [{ type: "text", text: "[]" }] });
    await new Promise((r) => setTimeout(r, 10));

    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(mockChild.kill).toHaveBeenCalled();
  });

  it("returns error when spawn fails", async () => {
    spawn.mockImplementation(() => {
      const child = createMockChild();
      setTimeout(() => child.emit("error", new Error("ENOENT")), 0);
      return child;
    });

    const result = await callMcpTool({
      command: "nonexistent",
      args: [],
      toolName: "test",
      toolArgs: {},
      timeoutMs: 1000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("ENOENT");
  });

  it("returns error on MCP protocol error response", async () => {
    const promise = callMcpTool({
      command: "python",
      args: ["-m", "test_server"],
      toolName: "search",
      toolArgs: {},
      timeoutMs: 5000,
    });

    await new Promise((r) => setTimeout(r, 10));
    sendJsonRpcError(mockChild, 1, { code: -32601, message: "Method not found" });
    await new Promise((r) => setTimeout(r, 10));

    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(mockChild.kill).toHaveBeenCalled();
  });

  it("times out when server doesn't respond", async () => {
    const promise = callMcpTool({
      command: "python",
      args: ["-m", "slow_server"],
      toolName: "search",
      toolArgs: {},
      timeoutMs: 100,
    });

    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.error).toContain("timeout");
    expect(mockChild.kill).toHaveBeenCalled();
  });

  it("kills child process on completion", async () => {
    const promise = callMcpTool({
      command: "python",
      args: ["-m", "test_server"],
      toolName: "search",
      toolArgs: {},
      timeoutMs: 5000,
    });

    await new Promise((r) => setTimeout(r, 10));
    sendJsonRpc(mockChild, 1, { protocolVersion: "2024-11-05", capabilities: {} });
    await new Promise((r) => setTimeout(r, 10));
    sendJsonRpc(mockChild, 2, { content: [{ type: "text", text: "[]" }] });
    await new Promise((r) => setTimeout(r, 10));

    await promise;

    expect(mockChild.kill).toHaveBeenCalled();
  });

  it("kills child process on error", async () => {
    const promise = callMcpTool({
      command: "python",
      args: ["-m", "test_server"],
      toolName: "search",
      toolArgs: {},
      timeoutMs: 5000,
    });

    await new Promise((r) => setTimeout(r, 10));
    sendJsonRpcError(mockChild, 1, { code: -1, message: "init failed" });
    await new Promise((r) => setTimeout(r, 10));

    await promise;

    expect(mockChild.kill).toHaveBeenCalled();
  });

  it("sends initialize message first", async () => {
    const promise = callMcpTool({
      command: "python",
      args: ["-m", "test_server"],
      toolName: "search",
      toolArgs: {},
      timeoutMs: 5000,
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(mockChild.stdin.write).toHaveBeenCalled();
    const initCall = mockChild.stdin.write.mock.calls[0][0];
    const initMsg = JSON.parse(initCall);
    expect(initMsg.method).toBe("initialize");
    expect(initMsg.params.protocolVersion).toBe("2024-11-05");

    // Complete the call
    sendJsonRpc(mockChild, 1, { protocolVersion: "2024-11-05", capabilities: {} });
    await new Promise((r) => setTimeout(r, 10));
    sendJsonRpc(mockChild, 2, { content: [{ type: "text", text: "[]" }] });
    await new Promise((r) => setTimeout(r, 10));

    await promise;
  });

  it("sends tools/call after initialize", async () => {
    const promise = callMcpTool({
      command: "python",
      args: ["-m", "test_server"],
      toolName: "search_feeds",
      toolArgs: { keyword: "AI", limit: 10 },
      timeoutMs: 5000,
    });

    await new Promise((r) => setTimeout(r, 10));
    sendJsonRpc(mockChild, 1, { protocolVersion: "2024-11-05", capabilities: {} });
    await new Promise((r) => setTimeout(r, 10));

    // Check that tools/call was sent (calls: [0]=initialize, [1]=initialized notif, [2]=tools/call)
    const callLine = mockChild.stdin.write.mock.calls[2][0];
    const callMsg = JSON.parse(callLine);
    expect(callMsg.method).toBe("tools/call");
    expect(callMsg.params.name).toBe("search_feeds");
    expect(callMsg.params.arguments).toEqual({ keyword: "AI", limit: 10 });

    // Complete
    sendJsonRpc(mockChild, 2, { content: [{ type: "text", text: "[]" }] });
    await new Promise((r) => setTimeout(r, 10));

    await promise;
  });
});
