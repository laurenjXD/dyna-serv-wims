// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { state, queue, pending } = vi.hoisted(() => ({ state: { currentUserId: "A" }, queue: vi.fn(), pending: vi.fn() }));
vi.mock("@/lib/offline/provider", () => ({ useOfflineStatus: () => ({ connectivity: "offline", currentUserId: state.currentUserId, queueObservation: queue }) }));
vi.mock("@/lib/offline/storage", () => ({ listPendingOfflineEntries: pending }));
vi.mock("@/components/floor/FloorCameraScanner", () => ({ FloorCameraScanner: () => null }));
import { OfflineDispatchScanForm } from "./OfflineDispatchScanForm";
const lines = [
  { id: "a", itemCode: "ITEM-A", itemBarcode: "BC-A", lotId: "lot-a", lotNumber: "LOT-A", locationId: "loc-a", locationLabel: "A1-01", numberOfBoxes: 3, selectedCount: 0 },
  { id: "b", itemCode: "ITEM-B", itemBarcode: "BC-B", lotId: "lot-b", lotNumber: "LOT-B", locationId: "loc-b", locationLabel: "B1-01", numberOfBoxes: 2, selectedCount: 0 },
];
function submit(barcode: string) { fireEvent.change(screen.getByRole("textbox"), { target: { value: barcode } }); fireEvent.submit(screen.getByRole("textbox").closest("form")!); }
describe("offline dispatch line resolution", () => {
  beforeEach(() => { vi.clearAllMocks(); state.currentUserId = "A"; queue.mockResolvedValue(undefined); pending.mockResolvedValue([]); });
  it("queues the actual matching line even when another line was first on the screen", async () => {
    render(<OfflineDispatchScanForm action={vi.fn()} pickListId="pick" lines={lines} />); await act(async () => {});
    submit("LOT-B");
    await waitFor(() => expect(queue).toHaveBeenCalledWith("pick_list_scan_observation", expect.objectContaining({ pickListItemId: "b", locationId: "loc-b" })));
  });
  it("advances through locally captured lines and rejects a repeated completed line", async () => {
    render(<OfflineDispatchScanForm action={vi.fn()} pickListId="pick" lines={lines} />); await act(async () => {});
    submit("ITEM-A"); await waitFor(() => expect(queue).toHaveBeenCalledTimes(1));
    submit("ITEM-B"); await waitFor(() => expect(queue).toHaveBeenCalledTimes(2));
    expect(queue.mock.calls.map(([, payload]) => payload.pickListItemId)).toEqual(["a", "b"]);
    submit("ITEM-A"); await act(async () => {});
    expect(queue).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/All shown lines are saved locally/)).toBeInTheDocument();
  });
  it("requires reconnection for an opaque carton identity that cannot be resolved offline", async () => {
    render(<OfflineDispatchScanForm action={vi.fn()} pickListId="pick" lines={lines} />); await act(async () => {});
    submit(JSON.stringify({ type: "inventory_unit", unit_id: "unit-b" })); await act(async () => {});
    expect(queue).not.toHaveBeenCalled();
    expect(screen.getByText(/Reconnect to verify this carton-specific QR/)).toBeInTheDocument();
  });
  it("restores only the original actor's saved lines", async () => {
    pending.mockResolvedValue([{ capturedByUserId: "A", actionType: "pick_list_scan_observation", payload: { pickListId: "pick", pickListItemId: "a" } }]);
    state.currentUserId = "B";
    render(<OfflineDispatchScanForm action={vi.fn()} pickListId="pick" lines={lines} />); await act(async () => {});
    submit("ITEM-A"); await waitFor(() => expect(queue).toHaveBeenCalledOnce());
    expect(pending).toHaveBeenCalledWith("B");
  });
  it("skips server-complete lines when a shared item barcode spans locations", async () => {
    render(<OfflineDispatchScanForm action={vi.fn()} pickListId="pick" lines={[{ ...lines[0], itemCode: "SHARED", selectedCount: 3 }, { ...lines[1], itemCode: "SHARED" }]} />); await act(async () => {});
    submit("SHARED"); await waitFor(() => expect(queue).toHaveBeenCalledWith("pick_list_scan_observation", expect.objectContaining({ pickListItemId: "b" })));
  });
});
