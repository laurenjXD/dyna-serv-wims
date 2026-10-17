// Utility for parsing User Agent strings into recognizable BYOD and workstation signatures.

export interface ParsedUserAgent {
  deviceAlias: string;
  isMobile: boolean;
  browserSummary: string;
}

export function parseUserAgentDevice(ua: string | null | undefined): ParsedUserAgent {
  if (!ua) {
    return { deviceAlias: "Unknown Device", isMobile: false, browserSummary: "Unspecified Client" };
  }
  const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|opera mini|iemobile|wpdesktop|zebra|handheld/i.test(ua);

  let browser = "Web Browser";
  if (ua.includes("Edg/")) browser = "Microsoft Edge";
  else if (ua.includes("Chrome/")) browser = "Google Chrome";
  else if (ua.includes("Safari/") && !ua.includes("Chrome/")) browser = "Apple Safari";
  else if (ua.includes("Firefox/")) browser = "Mozilla Firefox";
  else if (ua.includes("Vercel Edge")) browser = "Vercel Edge System";
  else if (ua === "node" || ua.includes("node-fetch")) browser = "API / Automation Client";

  let os = "Desktop";
  if (ua.includes("Windows NT 10.0")) os = "Windows 10/11";
  else if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone")) os = "iPhone iOS";
  else if (ua.includes("iPad")) os = "iPadOS";
  else if (ua.includes("Macintosh") || ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";

  let deviceAlias = "Desktop Workstation";
  if (isMobile) {
    if (ua.includes("Android")) deviceAlias = "BYOD Mobile · Android Handheld";
    else if (ua.includes("iPhone")) deviceAlias = "BYOD Mobile · Apple iPhone";
    else if (ua.includes("iPad")) deviceAlias = "BYOD Tablet · Apple iPad";
    else deviceAlias = "BYOD Mobile Handheld";
  } else if (ua.includes("Vercel Edge") || ua === "node") {
    deviceAlias = "System API Client";
  } else {
    deviceAlias = `Office Workstation · ${os}`;
  }

  return {
    deviceAlias,
    isMobile,
    browserSummary: `${browser} on ${os}`,
  };
}
