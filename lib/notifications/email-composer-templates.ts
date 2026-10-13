// Branded Transactional Email Templates & HTML Renderer for Dyna-Serv WIMS
//
// Traceability:
//   specs/04-services-and-infrastructure/design.md §5 (Resend transactional pipeline)
//   specs/06-party-and-item-enrollment/design.md §5a (Contact Party)
//   specs/00-steering/brand-design-system.md §2 (colors), §9 (typography)

export interface EmailTemplateOption {
  id: string;
  name: string;
  category: "qa" | "inbound" | "billing" | "dispatch" | "general";
  defaultSubject: string;
  defaultBody: string;
}

export const EMAIL_TEMPLATES: EmailTemplateOption[] = [
  {
    id: "qa_rejection_rtv",
    name: "QA Rejection / Return-to-Vendor Notice",
    category: "qa",
    defaultSubject: "ACTION REQUIRED: Non-Conformance & Quarantine Notice — Dyna-Serv WIMS",
    defaultBody: `Dear Quality & Logistics Team,

This is an automated notification from Dyna-Serv Warehouse Operations regarding a non-conformance flag recorded during inbound / storage inspection.

Details:
• Reason: Quality Inspection Non-Conformance
• Current Placement: Quarantine Hold Bay (LOC-QA-HOLD)
• Action Required: Please review the attached defect report and provide Return Merchandise Authorization (RMA) instructions within 48 business hours.

If you have any questions or require additional photographic documentation, please contact operations@dyna-serv.com.`,
  },
  {
    id: "inbound_wrr_confirmation",
    name: "Inbound Receiving (WRR) Confirmation",
    category: "inbound",
    defaultSubject: "Receiving Confirmation: Inbound Shipment Staged — Dyna-Serv WIMS",
    defaultBody: `Dear Logistics Partner,

We are pleased to confirm that your inbound shipment has been received and verified at the Dyna-Serv Warehouse facility.

Details:
• Status: Successfully Received & Count Verified
• Documentation: Warehouse Receiving Receipt (WRR) generated
• Storage Zone: Active Storage & Inventory Ledger updated

Please find the attached receiving documentation for your records.`,
  },
  {
    id: "vmi_storage_statement",
    name: "VMI Storage & Billing Statement",
    category: "billing",
    defaultSubject: "Monthly VMI Storage & Utilization Statement — Dyna-Serv WIMS",
    defaultBody: `Dear Finance & Accounts Team,

Please find attached the latest Vendor Managed Inventory (VMI) space utilization and handling fee statement for the current billing cycle.

Summary:
• Service: VMI Pallet & Volumetric Storage
• Terms: In accordance with our signed Master Services Agreement
• Payment Due: As per standard credit terms

For billing inquiries or rate matrix reconciliations, please reply directly to billing@dyna-serv.com.`,
  },
  {
    id: "delivery_discrepancy",
    name: "Delivery & Count Discrepancy Notice",
    category: "dispatch",
    defaultSubject: "DISCREPANCY NOTICE: Inbound Shipment Variance — Dyna-Serv WIMS",
    defaultBody: `Dear Shipping & Receiving Team,

During the physical count and cross-dock verification of your recent inbound delivery, our receiving team identified a discrepancy between the packing list manifest and actual unloaded units.

Discrepancy Summary:
• Inspection Status: Physical Count Variance Recorded
• Action: Quarantine hold applied on affected line items pending reconciliation

Please review the attached tally sheet and advise on the appropriate adjustment or credit memo.`,
  },
  {
    id: "custom_message",
    name: "Custom Operational Message",
    category: "general",
    defaultSubject: "Message from Dyna-Serv Operations",
    defaultBody: `Dear Partner,

We are reaching out from Dyna-Serv Warehouse Operations regarding your active account.

[Please enter your custom message or operational update here...]

Thank you for your ongoing partnership.`,
  },
];

export interface BrandedEmailProps {
  partyName: string;
  contactPerson?: string | null;
  subject: string;
  templateCategory?: string;
  messageBody: string;
  attachmentNames?: string[];
}

export function generateBrandedEmailHtml({
  partyName,
  contactPerson,
  subject,
  templateCategory = "general",
  messageBody,
  attachmentNames = [],
}: BrandedEmailProps): string {
  // Convert newlines to paragraphs / line breaks for email HTML
  const formattedBody = messageBody
    .split("\n\n")
    .map((paragraph) => `<p style="margin: 0 0 16px 0; line-height: 1.6; color: #1e293b; font-size: 15px;">${paragraph.replace(/\n/g, "<br/>")}</p>`)
    .join("");

  const categoryBadgeColor =
    templateCategory === "qa"
      ? { bg: "#FFF1F2", border: "#FECDD3", text: "#9F1239", label: "QUALITY & CONFORMANCE" }
      : templateCategory === "billing"
      ? { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46", label: "FINANCIAL STATEMENT" }
      : templateCategory === "dispatch" || templateCategory === "inbound"
      ? { bg: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF", label: "LOGISTICS UPDATE" }
      : { bg: "#F8FAFC", border: "#E2E8F0", text: "#334155", label: "OPERATIONAL NOTICE" };

  const attachmentsHtml =
    attachmentNames.length > 0
      ? `
        <div style="margin-top: 24px; padding: 16px; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px;">
          <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; margin-bottom: 8px;">
            Attached Documents (${attachmentNames.length})
          </div>
          <ul style="margin: 0; padding-left: 20px; color: #002060; font-size: 13px; font-family: monospace;">
            ${attachmentNames.map((name) => `<li style="margin-bottom: 4px;"><strong>${name}</strong></li>`).join("")}
          </ul>
        </div>
      `
      : "";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F1F5F9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Email Container -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 620px; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05); border: 1px solid #E2E8F0;">
          
          <!-- Top Header Banner with Brand Navy -->
          <tr>
            <td style="background-color: #002060; padding: 24px 32px; border-bottom: 3px solid #E11D48;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="font-size: 20px; font-weight: 800; color: #FFFFFF; letter-spacing: -0.02em; text-transform: uppercase;">
                      Dyna-Serv <span style="color: #F43F5E; font-weight: 400;">WIMS</span>
                    </div>
                    <div style="font-size: 12px; color: #94A3B8; margin-top: 2px; letter-spacing: 0.05em; text-transform: uppercase;">
                      Warehouse &amp; Inventory Management System
                    </div>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; background-color: ${categoryBadgeColor.bg}; border: 1px solid ${categoryBadgeColor.border}; color: ${categoryBadgeColor.text}; font-size: 10px; font-weight: 700; padding: 4px 8px; border-radius: 6px; letter-spacing: 0.05em;">
                      ${categoryBadgeColor.label}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Message Body Content -->
          <tr>
            <td style="padding: 32px;">
              <!-- Salutation -->
              <div style="font-size: 16px; font-weight: 600; color: #002060; margin-bottom: 16px;">
                ${contactPerson ? `Dear ${contactPerson} (${partyName}),` : `Dear ${partyName} Team,`}
              </div>

              <!-- Main Content -->
              <div style="color: #334155; font-size: 15px;">
                ${formattedBody}
              </div>

              <!-- Attachments if any -->
              ${attachmentsHtml}

              <!-- Signature -->
              <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #E2E8F0; color: #64748B; font-size: 13px;">
                <p style="margin: 0; font-weight: 600; color: #002060;">Dyna-Serv Operations Dispatch</p>
                <p style="margin: 2px 0 0 0; color: #64748B;">Automated Warehouse Notification Service</p>
                <p style="margin: 2px 0 0 0; color: #94A3B8; font-size: 12px;">Ref: Partner Account <strong>${partyName}</strong></p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F8FAFC; padding: 20px 32px; border-top: 1px solid #E2E8F0; text-align: center; color: #94A3B8; font-size: 11px; line-height: 1.5;">
              <p style="margin: 0;">This email was sent by the Dyna-Serv WIMS platform to an authorized operational contact.</p>
              <p style="margin: 4px 0 0 0;">Dyna-Serv Logistics Hub • Single Warehouse Facility • Security &amp; Compliance Verified</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export function generateTeamInvitationEmailHtml({
  displayName,
  roleName,
  inviteUrl,
}: {
  displayName: string;
  roleName: string;
  inviteUrl: string;
}): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation to join Dyna-Serv WIMS</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F1F5F9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Email Container -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05); border: 1px solid #E2E8F0;">
          
          <!-- Top Header Banner with Brand Navy -->
          <tr>
            <td style="background-color: #002060; padding: 24px 32px; border-bottom: 3px solid #E11D48;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="font-size: 20px; font-weight: 800; color: #FFFFFF; letter-spacing: -0.02em; text-transform: uppercase;">
                      Dyna-Serv <span style="color: #F43F5E; font-weight: 400;">WIMS</span>
                    </div>
                    <div style="font-size: 12px; color: #94A3B8; margin-top: 2px; letter-spacing: 0.05em; text-transform: uppercase;">
                      Warehouse &amp; Inventory Management System
                    </div>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; background-color: #EDF2FF; border: 1px solid #C7D2FE; color: #1E40AF; font-size: 10px; font-weight: 700; padding: 4px 8px; border-radius: 6px; letter-spacing: 0.05em;">
                      TEAM ONBOARDING
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Message Body Content -->
          <tr>
            <td style="padding: 32px;">
              <!-- Salutation -->
              <div style="font-size: 18px; font-weight: 700; color: #002060; margin-bottom: 12px;">
                Welcome to the Team, ${displayName}
              </div>

              <!-- Main Content -->
              <p style="margin: 0 0 16px 0; line-height: 1.6; color: #334155; font-size: 15px;">
                You have been invited to join the <strong>Dyna-Serv Warehouse &amp; Inventory Management System (WIMS)</strong> with pre-assigned access as <strong>${roleName}</strong>.
              </p>

              <p style="margin: 0 0 24px 0; line-height: 1.6; color: #334155; font-size: 15px;">
                Please click the button below to complete your onboarding, set your account password, and activate your warehouse access.
              </p>

              <!-- CTA Button -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="${inviteUrl}" style="display: inline-block; background-color: #002060; color: #FFFFFF; font-weight: 700; font-size: 15px; padding: 14px 28px; border-radius: 8px; text-decoration: none; box-shadow: 0 2px 4px rgba(0, 32, 96, 0.2);">
                  Accept Invitation &amp; Setup Account &rarr;
                </a>
              </div>

              <div style="margin-top: 24px; padding: 14px; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px;">
                <div style="font-size: 12px; color: #64748B; line-height: 1.5;">
                  <strong>Note:</strong> If the button above does not work, copy and paste this link into your browser:
                  <br/>
                  <a href="${inviteUrl}" style="color: #1E40AF; word-break: break-all; font-size: 12px; font-family: monospace;">${inviteUrl}</a>
                </div>
              </div>

              <!-- Signature -->
              <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #E2E8F0; color: #64748B; font-size: 13px;">
                <p style="margin: 0; font-weight: 600; color: #002060;">Dyna-Serv Operations &amp; Administration</p>
                <p style="margin: 2px 0 0 0; color: #94A3B8; font-size: 12px;">Automated Warehouse Team Provisioning</p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F8FAFC; padding: 20px 32px; border-top: 1px solid #E2E8F0; text-align: center; color: #94A3B8; font-size: 11px; line-height: 1.5;">
              <p style="margin: 0;">This invitation was sent by an authorized administrator in Dyna-Serv WIMS.</p>
              <p style="margin: 4px 0 0 0;">Single Warehouse Facility • Security &amp; Compliance Verified</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
