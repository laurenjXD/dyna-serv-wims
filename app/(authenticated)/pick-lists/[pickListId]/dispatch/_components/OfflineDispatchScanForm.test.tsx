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
const carton = (unitId: string) => JSON.stringify({ type: "inventory_unit", unit_id: unitId });

describe("offline carton dispatch observations", () => {
  beforeEach(() => { vi.clearAllMocks(); state.currentUserId = "A"; queue.mockResolvedValue(undefined); pending.mockResolvedValue([]); });
  it("requires online verification for a carton identity", async () => {
    render(<OfflineDispatchScanForm action={vi.fn()} pickListId="pick" lines={lines} />); await act(async () => {});
    submit(carton("unit-a"));
    await act(async () => {});
    expect(queue).not.toHaveBeenCalled();
    expect(screen.getByText(/Reconnect to verify this carton-specific QR/)).toBeInTheDocument();
  });
  it("rejects item and lot labels", async () => {
    render(<OfflineDispatchScanForm action={vi.fn()} pickListId="pick" lines={lines} />); await act(async () => {});
    submit("LOT-A"); await act(async () => {});
    expect(queue).not.toHaveBeenCalled();
    expect(screen.getByText(/carton-specific QR is required/)).toBeInTheDocument();
  });
});
