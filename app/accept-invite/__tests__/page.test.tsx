// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AcceptInvitePage from "../page";

const getUser = vi.fn();
const verifyOtp = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getUser, verifyOtp } }),
}));
vi.mock("../actions", () => ({ completeInvitationAcceptance: vi.fn() }));

describe("invitation onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/accept-invite");
  });

  it("verifies a token-hash invite before enabling account setup", async () => {
    window.history.replaceState(null, "", "/accept-invite?token_hash=one-time-token&type=invite");
    verifyOtp.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { user_metadata: { displayName: "New Operator" } } }, error: null });
    render(<AcceptInvitePage />);
    await waitFor(() => expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "one-time-token", type: "invite" }));
    expect(await screen.findByDisplayValue("New Operator")).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("keeps setup disabled when the link has no authenticated session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    render(<AcceptInvitePage />);
    expect(await screen.findByText(/Open the invitation link from your email/)).toBeInTheDocument();
    expect(screen.getByTestId("accept-invite-submit")).toBeDisabled();
  });

  it("shows an expired-token error instead of asking for a password", async () => {
    window.history.replaceState(null, "", "/accept-invite?token_hash=expired&type=invite");
    verifyOtp.mockResolvedValue({ error: new Error("Token has expired") });
    render(<AcceptInvitePage />);
    expect(await screen.findByText(/Token has expired/)).toBeInTheDocument();
    expect(getUser).not.toHaveBeenCalled();
    expect(screen.getByTestId("accept-invite-submit")).toBeDisabled();
  });
});
