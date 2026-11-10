"use client";

import { useEffect } from "react";

interface ItemEnrollmentCompletionBridgeProps {
  channelName: string;
  itemId: string;
}

/** Notify an open CIPL import session that its new catalog item is available. */
export function ItemEnrollmentCompletionBridge({
  channelName,
  itemId,
}: ItemEnrollmentCompletionBridgeProps) {
  useEffect(() => {
    const message = {
      type: "wims:item-enrolled",
      channel: channelName,
      itemId,
    };

    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(channelName);
      channel.postMessage(message);
      channel.close();
    }

    // Keep a window-message fallback for browsers that do not expose
    // BroadcastChannel or when the shortcut was opened by a same-window link.
    if (window.opener) {
      window.opener.postMessage(message, window.location.origin);
    }
  }, [channelName, itemId]);

  return null;
}
