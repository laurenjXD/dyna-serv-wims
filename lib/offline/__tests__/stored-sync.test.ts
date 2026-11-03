import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OfflineQueueEnvelope } from "../index";
const { listPending, update, remove } = vi.hoisted(() => ({ listPending: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock("../storage", () => ({ listPendingOfflineEntries: listPending, updateOfflineEntry: update, deleteOfflineEntry: remove, listOfflineEntries: vi.fn() }));
import { replayStoredOfflineEntries, replayStoredOfflineEntriesOnce } from "../sync";
function entry(id: string, user: string): OfflineQueueEnvelope { return { id, capturedByUserId: user, actionType: "receiving_scan_observation", version: 1, payload: {}, createdAt: 1, attempts: 0, status: "pending" }; }
describe("stored replay actor ownership", () => {
  beforeEach(() => { vi.clearAllMocks(); update.mockResolvedValue(undefined); remove.mockResolvedValue(undefined); });
  it("requests only the current actor and never quarantines another actor's entry", async () => {
    const own = entry("a", "A"); const other = entry("b", "B");
    listPending.mockResolvedValue([own, other]);
    const submit = vi.fn(async () => ({ outcome: "applied" as const }));
    await replayStoredOfflineEntries("A", submit);
    expect(listPending).toHaveBeenCalledWith("A");
    expect(submit).toHaveBeenCalledTimes(1);
    expect(update.mock.calls.every(([row]) => row.capturedByUserId === "A")).toBe(true);
    expect(remove).toHaveBeenCalledWith("a");
    expect(remove).not.toHaveBeenCalledWith("b");
  });
  it("preserves the original actor's work if a session changes during a request", async () => {
    listPending.mockResolvedValue([entry("a", "A"), entry("a2", "A")]);
    let actor = "A";
    let finish!: (value: { outcome: "applied" }) => void;
    const submit = vi.fn(() => new Promise<{ outcome: "applied" }>((resolve) => { finish = resolve; }));
    const running = replayStoredOfflineEntries("A", submit, () => actor === "A");
    await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
    actor = "B"; finish({ outcome: "applied" });
    await running;
    expect(remove).not.toHaveBeenCalled();
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ id: "a", status: "pending" }));
    expect(submit).toHaveBeenCalledOnce();
  });
  it("coalesces same-actor triggers without sharing replay results between actors", async () => {
    listPending.mockImplementation(async (user: string) => [entry(user, user)]);
    let finish!: (value: { outcome: "applied" }) => void;
    const submitA = vi.fn(() => new Promise<{ outcome: "applied" }>((resolve) => { finish = resolve; }));
    const a = replayStoredOfflineEntriesOnce("A", submitA);
    expect(replayStoredOfflineEntriesOnce("A", submitA)).toBe(a);
    const submitB = vi.fn(async () => ({ outcome: "applied" as const }));
    const b = replayStoredOfflineEntriesOnce("B", submitB);
    await vi.waitFor(() => expect(submitB).toHaveBeenCalledOnce());
    finish({ outcome: "applied" });
    const [ar, br] = await Promise.all([a, b]);
    expect(ar[0].entry.capturedByUserId).toBe("A");
    expect(br[0].entry.capturedByUserId).toBe("B");
  });
});
