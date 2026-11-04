# Accounts, roles, and access

This guide explains how an authorized administrator changes account role assignments and custom role permissions. Access changes are sensitive: use an individual account, enter a meaningful reason, and verify the proposed effective permissions before saving.

## How the two editors differ

The **Account access** editor assigns or removes roles on one existing account. Its **Current effective permissions** list is what that account currently receives; **Proposed effective permissions** previews the result of the selected roles. These lists are read-only. If both lists show the same permissions, the proposed role selection has not changed effective access.

The **Roles & permissions** editor creates and changes a reusable custom role. A role definition change affects every account assigned to that role. Built-in roles such as **Warehouse Staff**, **Supervisor**, **Administrator**, and **Party User** are protected and cannot be edited. Create a custom role when you need a different permission bundle.

Permissions from active roles combine. Removing a role does not remove a permission that another assigned role still grants. There are no direct per-user permission overrides or explicit deny rules. Role changes apply to the account's next protected request; the account does not need a new sign-in for database authorization to see the change. An already-open page may need navigation or refresh to display the new actions.

## Create or update a custom role

1. Open **Settings → Team → Roles & permissions**. You need an active built-in Administrator account with role-management access.
2. Choose **Create role** or select a custom role from the catalog. A protected system role is read-only.
3. Give the role a clear name and description. Choose only the permissions needed for its work. The list is the server-provided permission catalog; use **Find permissions** to narrow it.
4. Keep the role to one scope type. Warehouse-wide and Assigned Organizations grants cannot be mixed in a role.
5. Enter the reason, select the confirmation box, and save.
6. For a change to an existing role, review all assigned accounts first. Removing a grant changes access for every account using that role.

The UI's **Deactivate role** action disables the custom role while preserving its history. Accounts assigned an inactive role do not receive its grants. Replace or remove the assignment as appropriate. Do not deactivate the last active Administrator role or its only administrator account; the system enforces recovery protection.

## Assign roles to an account

1. In **Settings → Team**, open that account's **Account access** editor.
2. Select or clear role checkboxes. The permission lists below update to show current and proposed effective access.
3. Compare the two lists. If removing a role leaves a permission in Proposed, another selected role still grants it.
4. Enter a reason of at least three characters, select the confirmation box, and choose **Save account access**.
5. Refresh the Team directory and, if needed, have the user navigate or refresh their WIMS page. Confirm the expected allowed and unavailable actions.

Accounts can hold more than one role, but warehouse-wide and Organization-scoped access cannot be combined. An Organization account needs a separate active Organization scope. Keep that account on the protected **Party User** role for portal access; do not add a warehouse-wide custom role to it.

## Suggested custom role bundles

These are starting points, not new built-in roles. Create only the bundles your team needs. Each grant below uses the **Warehouse-wide** scope unless the row says otherwise. The Team editor's effective-permission preview is the final check for what an account will receive.

| Suggested role | Starting permissions | Use and limits |
|---|---|---|
| Receiving operator | `receiving.view`, `receiving.scan`, `receiving.confirm`, `inventory.read`, `items.read`, `locations.read`, `parties.read` | Receive and place stock. Add `inspection.perform` only when this worker performs inspection evidence capture. Leave `inspection.resolve` to a designated reviewer. Add `documents.read`, `documents.generate`, or `documents.download` only when the workflow requires those actions. |
| Pick and dispatch operator | `pick_list.read`, `pick_list.generate`, `pick_list.execute`, `dispatch.read`, `dispatch.execute`, `inventory.read`, `items.read`, `locations.read`, `parties.read` | Prepare and carry out releases. Add `fifo_override.request` only if the operator may request an exception; reserve `fifo_override.approve` for a separate reviewer. Add document grants only when needed. |
| Stock-count clerk | `cycle_count.view`, `cycle_count.create`, `cycle_count.count`, `inventory.read`, `items.read`, `locations.read` | Start a count and record physical quantities. This role does not approve or post adjustments. |
| Stock-count reviewer | `cycle_count.view`, `cycle_count.review`, `cycle_count.post`, `inventory.read`, `locations.read` | Review variances and post approved reconciliation adjustments. Assign to a trusted reviewer; keep counting and approval duties separate where staffing allows. |
| Transfer operator | `transfer.view`, `transfer.request`, `transfer.execute`, `inventory.read`, `items.read`, `locations.read` | Request and execute warehouse transfers. Add `transfer.approve` only to a separate reviewer. The catalog also contains the similarly named plural `transfers.*` family; inspect the exact action used by the target screen before adding those entries. |
| Operations report reader | `reporting.read` | View operational reports. Add `reporting.export` only when the account should export report data. |
| Financial report reader | `reporting.read`, `reporting.financial_read` | View sensitive cost, price-reference, margin, and financial reports. Add `reporting.export` only when financial exports are authorized. Keep this bundle limited to finance or management users who need that data. |
| Master-data steward | `parties.read`, `parties.manage`, `items.read`, `items.manage`, `locations.read`, `locations.manage` | Maintain Organization, material, and location records. This is a broad administrative bundle; use separate narrower roles if one person should manage only one catalog. |

`audit_log.read`, `users.*`, `access_assignments.*`, `party_scopes.*`, and `security_events.read` expose audit or security administration. Keep those grants with the designated access administrators/auditors. Custom operational grants do not bypass workflow checks that explicitly require a built-in Administrator.

Do not create a separate custom Organization portal role by copying these warehouse-wide examples. Party User access depends on an active Organization scope and assigned-party grants. If an Organization account needs a narrower portal capability, have the administrator review its scoped permissions and scope together.

## Troubleshoot access

| What you see | What to check |
|---|---|
| The current and proposed lists match | The selected roles still grant the same permissions, or no role checkbox changed. Review role selections and overlapping grants. |
| A permission stays after removing a role | Another selected active role grants it. Remove or edit that custom role only after checking its other assigned accounts. |
| A role is marked **Protected system role** | Built-in role permissions are fixed. Create a custom role with the desired permission set and assign it to the account. |
| A role cannot be saved with a mix of scopes | Use one role for warehouse-wide grants or one for assigned Organizations. Organization-scoped accounts cannot also receive warehouse-wide grants. |
| A role is missing from the account selector | The role may be inactive. Refresh the Team directory and check the role catalog. |
| The permission is present but an action still fails | The workflow may require another grant, an active Organization scope, an allowed record status, or an explicit Administrator-only check. Record the route, record ID, action, and exact message for review. |

Never test a permission change on another person's live account. Use a designated test account and verify both the allowed action and an action that should remain unavailable.
