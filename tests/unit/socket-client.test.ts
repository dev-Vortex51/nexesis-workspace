import { describe, it, expect, afterEach } from "vitest";
import { toOrigin, resolveSocketUrl } from "../../lib/socket-client";

/**
 * Unit tests for socket URL resolution. The key case: falling back to
 * `NEXT_PUBLIC_API_URL` (which includes the `/api/v1` base path) must yield the
 * bare origin, or Socket.IO would treat the path as a namespace and fail to
 * connect against the server's default namespace.
 */

const ORIGINAL_SOCKET = process.env.NEXT_PUBLIC_SOCKET_URL;
const ORIGINAL_API = process.env.NEXT_PUBLIC_API_URL;

afterEach(() => {
  // Restore env between cases so ordering can't leak state.
  if (ORIGINAL_SOCKET === undefined) delete process.env.NEXT_PUBLIC_SOCKET_URL;
  else process.env.NEXT_PUBLIC_SOCKET_URL = ORIGINAL_SOCKET;
  if (ORIGINAL_API === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = ORIGINAL_API;
});

describe("toOrigin", () => {
  it("strips the /api/v1 base path to the origin", () => {
    expect(toOrigin("https://host.example/api/v1")).toBe(
      "https://host.example",
    );
  });

  it("preserves a non-default port", () => {
    expect(toOrigin("http://localhost:4000/api/v1")).toBe(
      "http://localhost:4000",
    );
  });

  it("returns the raw value when it is not an absolute URL", () => {
    expect(toOrigin("/api/v1")).toBe("/api/v1");
  });
});

describe("resolveSocketUrl", () => {
  it("uses an explicit url verbatim", () => {
    process.env.NEXT_PUBLIC_SOCKET_URL = "https://sockets.example";
    expect(resolveSocketUrl("wss://explicit.example/ns")).toBe(
      "wss://explicit.example/ns",
    );
  });

  it("prefers NEXT_PUBLIC_SOCKET_URL verbatim over the API URL", () => {
    process.env.NEXT_PUBLIC_SOCKET_URL = "https://sockets.example";
    process.env.NEXT_PUBLIC_API_URL = "https://host.example/api/v1";
    expect(resolveSocketUrl()).toBe("https://sockets.example");
  });

  it("derives the origin from NEXT_PUBLIC_API_URL when no socket url is set", () => {
    delete process.env.NEXT_PUBLIC_SOCKET_URL;
    process.env.NEXT_PUBLIC_API_URL = "https://host.example/api/v1";
    expect(resolveSocketUrl()).toBe("https://host.example");
  });

  it("falls back to the localhost default when nothing is configured", () => {
    delete process.env.NEXT_PUBLIC_SOCKET_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    expect(resolveSocketUrl()).toBe("http://localhost:3000");
  });
});
