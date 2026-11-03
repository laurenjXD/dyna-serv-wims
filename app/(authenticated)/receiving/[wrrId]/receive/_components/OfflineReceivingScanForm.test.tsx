// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { state, pending, queue } = vi.hoisted(() => ({ state: { currentUserId: "user-a" as string | null }, pending: vi.fn(), queue: vi.fn() }));
vi.mock("@/lib/offline/provider", () => ({ useOfflineStatus: () => ({ connectivity: "offline", currentUserId: state.currentUserId, queueObservation: queue }) }));
vi.mock("@/lib/offline/storage", () => ({ listPendingOfflineEntries: pending }));
vi.mock("./ReceivingCameraScanner", () => ({ ReceivingCameraScanner: () => null }));
import { OfflineReceivingScanForm } from "./OfflineReceivingScanForm";
const line = { id: "line", wrrId: "wrr", itemId: "item", itemBarcode: "BC", lotNumber: "LOT", expectedQty: 2, scannedQty: 0, cartonCount: 2, spq: 1, disposition: "store" as const };
function form() { return <OfflineReceivingScanForm action={vi.fn()} wrrId="wrr" flowType="vmi" lines={[line]} />; }
function submit() { fireEvent.change(screen.getByRole("textbox"), { target: { value: "BC" } }); fireEvent.submit(screen.getByRole("textbox").closest("form")!); }
describe("offline receiving shared-device isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.currentUserId = "user-a"; queue.mockResolvedValue(undefined);
    pending.mockImplementation(async (actor?: string) => actor === "user-b" ? [] : [{ actionType: "receiving_scan_observation", capturedByUserId: "user-a", payload: { wrrId: "wrr", wrrItemId: "line", scannedQty: 2 } }]);
  });
  it("restores pending counts only for the currently signed-in actor", async () => {
    state.currentUserId = "user-b";
    render(form());
    await act(async () => {});
    submit();
    await waitFor(() => expect(queue).toHaveBeenCalledOnce());
    expect(pending).toHaveBeenCalledWith("user-b");
  });
  it("drops the previous actor's counts immediately when the session changes", async () => {
    const view = render(form());
    await act(async () => {});
    submit();
    expect(await screen.findByText(/already has all expected scans/i)).toBeInTheDocument();
    expect(queue).not.toHaveBeenCalled();
    state.currentUserId = "user-b";
    pending.mockReturnValue(new Promise(() => {}));
    view.rerender(form());
    submit();
    await waitFor(() => expect(queue).toHaveBeenCalledOnce());
  });
  it("drops acknowledged local counts after server lines refresh", async () => {
    pending.mockResolvedValue([]);
    const inspected = { ...line, expectedQty: 3, cartonCount: 3, disposition: "inspect" as const };
    const view = render(<OfflineReceivingScanForm action={vi.fn()} wrrId="wrr" flowType="vmi" lines={[inspected]} />);
    await act(async () => {});
    submit(); await waitFor(() => expect(queue).toHaveBeenCalledTimes(1));
    view.rerender(<OfflineReceivingScanForm action={vi.fn()} wrrId="wrr" flowType="vmi" lines={[{ ...inspected, scannedQty: 1 }]} />);
    await act(async () => {});
    submit(); await waitFor(() => expect(queue).toHaveBeenCalledTimes(2));
    submit(); await waitFor(() => expect(queue).toHaveBeenCalledTimes(3));
  });
  it("does not restore another actor's queue while signed out", async () => {
    state.currentUserId = null;
    render(form());
    await act(async () => {});
    submit();
    expect(pending).not.toHaveBeenCalled();
    expect(queue).not.toHaveBeenCalled();
  });
});
