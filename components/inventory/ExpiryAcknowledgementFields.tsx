import { evaluateExpiry, expiryReviewKey, type ExpiryReviewLine } from "@/lib/inventory/expiry-policy";

/** Native form fields are unchecked for every distinct review. */
export function ExpiryAcknowledgementFields({ lines }: { lines: Array<ExpiryReviewLine & { lotNumber?: string }> }) {
  if (!lines.length) return null;
  const key = expiryReviewKey(lines);
  return <fieldset key={key} className="my-3 space-y-3 rounded-xl border border-status-held/40 bg-status-held/5 p-4 text-base">
    <legend className="px-1 font-semibold text-on-surface">Past expiry — acknowledgement required</legend>
    <p>These materials are past their recorded expiry date. Their item policy permits release after acknowledgement.</p>
    <ul className="space-y-1">{lines.map((line, index) => <li key={`${line.lotId}:${line.locationId}:${index}`}>
      Lot {line.lotNumber ?? line.lotId}: {line.qty} units · Expiry {line.expiryDate} · {evaluateExpiry(line).daysPastExpiry} days past expiry
    </li>)}</ul>
    <input type="hidden" name="expiryReviewKey" value={key} />
    <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="expiryAcknowledged" value="yes" required className="h-5 w-5" />I acknowledge the past-expiry materials listed above.</label>
    <label className="block">Reason for release<textarea name="expiryReason" required maxLength={1000} rows={2} className="mt-1 block w-full rounded-lg border border-outline-variant bg-surface-white p-3 text-base" /></label>
  </fieldset>;
}
