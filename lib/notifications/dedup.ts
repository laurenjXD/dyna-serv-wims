// Traceability: specs/14-notifications-and-alerts/design.md §4 ("A unique
// key such as (event_id, recipient_id, channel, template_version)
// prevents duplicate effects") and §9 ("a low-stock alert for the same
// item suppresses duplicate firings for the configured cooldown period").

export function buildIdempotencyKey(input: {
  eventId: string;
  recipientId: string;
  channel: "in_app" | "email";
  templateVersion: string;
}): string {
  return [input.eventId, input.recipientId, input.channel, input.templateVersion].join(":");
}

export function isWithinCooldown(input: {
  lastFiredAt: Date | null;
  now: Date;
  cooldownHours: number;
}): boolean {
  if (input.lastFiredAt === null) return false;
  const elapsedMs = input.now.getTime() - input.lastFiredAt.getTime();
  const cooldownMs = input.cooldownHours * 60 * 60 * 1000;
  return elapsedMs < cooldownMs;
}
