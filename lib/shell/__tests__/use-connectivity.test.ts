// @vitest-environment jsdom
//
// RED-step unit tests for lib/shell/use-connectivity.ts (does not exist yet).
//
// Traceability: specs/05-ui-shell-and-navigation/tasks.md §5 "Implement
// read-only connectivity indicator (`online`, `offline`, `checking`) ...
// via `03` contract." requirements.md R8.1 ("the shell MAY display an
// informational online/offline indicator") and R8.2 ("The indicator SHALL
// distinguish connectivity (`online`, `offline`, `checking`) from
// synchronization ... and SHALL not claim that data is synchronized without
// authoritative evidence").
//
// Scope note (task-owner decision, this RED cycle): only the CONNECTIVITY
// half of this checklist item is covered here. lib/offline/index.ts is
// still a bare placeholder with no real Tier 1 sync queue, so a
// synchronization indicator has no authoritative data source yet -- R8.2
// forbids claiming sync state without evidence. Synchronization status gets
// its own RED cycle once 03-offline-mode-and-client-storage's queue exists.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/shell/use-connectivity.ts (for the
// builder agent):
//
//   "use client";
//   export function useConnectivityStatus(): "online" | "offline" | "checking";
//
// Behavior pinned by these tests:
//   - Initial render value reflects `navigator.onLine` immediately (no
//     transient "checking" tick is asserted here -- this test pins the
//     synchronous-resolution behavior: true -> "online", false -> "offline").
//   - The hook subscribes to the browser's `online`/`offline` window events
//     and updates its returned value live when those events fire.
// ---------------------------------------------------------------------------

import { describe, expect, it, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

describe("lib/shell/use-connectivity — useConnectivityStatus (tasks.md §5, requirements.md R8.1/R8.2)", () => {
  afterEach(() => {
    // Restore a sane default so other test files in the same jsdom worker
    // aren't affected by whichever value the last test in this file set.
    setNavigatorOnLine(true);
  });

  it("reflects navigator.onLine === true as 'online' on initial render", async () => {
    setNavigatorOnLine(true);

    const { useConnectivityStatus } = await import("../use-connectivity");
    const { result } = renderHook(() => useConnectivityStatus());

    expect(result.current).toBe("online");
  });

  it("reflects navigator.onLine === false as 'offline' on initial render", async () => {
    setNavigatorOnLine(false);

    const { useConnectivityStatus } = await import("../use-connectivity");
    const { result } = renderHook(() => useConnectivityStatus());

    expect(result.current).toBe("offline");
  });

  it("updates to 'offline' when the browser fires a real 'offline' window event", async () => {
    setNavigatorOnLine(true);

    const { useConnectivityStatus } = await import("../use-connectivity");
    const { result } = renderHook(() => useConnectivityStatus());

    expect(result.current).toBe("online");

    act(() => {
      setNavigatorOnLine(false);
      window.dispatchEvent(new Event("offline"));
    });

    expect(result.current).toBe("offline");
  });

  it("updates to 'online' when the browser fires a real 'online' window event", async () => {
    setNavigatorOnLine(false);

    const { useConnectivityStatus } = await import("../use-connectivity");
    const { result } = renderHook(() => useConnectivityStatus());

    expect(result.current).toBe("offline");

    act(() => {
      setNavigatorOnLine(true);
      window.dispatchEvent(new Event("online"));
    });

    expect(result.current).toBe("online");
  });
});
