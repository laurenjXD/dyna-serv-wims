import React from "react";
import {
  CheckCircle2,
  Clock,
  AlertOctagon,
  MinusCircle,
  Info,
  Shield,
  UserCheck,
  HardHat,
  Building2,
  Boxes,
  Layers,
  ArrowDownUp,
} from "lucide-react";
import { Badge, BadgeSize } from "./Badge";

export type SemanticStatus =
  | "available"
  | "passed"
  | "approved"
  | "completed"
  | "fulfilled"
  | "active"
  | "pending"
  | "in_transit"
  | "under_inspection"
  | "draft"
  | "held"
  | "rejected"
  | "failed"
  | "expired"
  | "cancelled"
  | "suspended"
  | "depleted"
  | "archived"
  | "on_hold";

export interface StatusBadgeProps {
  status: SemanticStatus | string;
  size?: BadgeSize;
  label?: string;
  showIcon?: boolean;
  className?: string;
}

export function StatusBadge({
  status,
  size = "md",
  label,
  showIcon = true,
  className = "",
}: StatusBadgeProps) {
  const normalized = status.toLowerCase().replace(/[\s-]/g, "_");

  // Determine variant, icon, and display label
  let variant: "success" | "warning" | "error" | "neutral" | "primary" = "neutral";
  let Icon = MinusCircle;
  let displayLabel = label || status.replace(/_/g, " ");

  switch (normalized) {
    case "available":
    case "passed":
    case "approved":
    case "completed":
    case "fulfilled":
    case "active":
    case "received":
      variant = "success";
      Icon = CheckCircle2;
      break;

    case "pending":
    case "in_transit":
    case "under_inspection":
    case "pending_approval":
    case "draft":
    case "staged":
      variant = "warning";
      Icon = Clock;
      break;

    case "held":
    case "rejected":
    case "failed":
    case "expired":
    case "cancelled":
    case "suspended":
    case "error":
      variant = "error";
      Icon = AlertOctagon;
      break;

    case "depleted":
    case "archived":
    case "on_hold":
    case "inactive":
    default:
      variant = "neutral";
      Icon = MinusCircle;
      break;
  }

  const iconSizeClass = size === "sm" ? "w-3 h-3" : size === "lg" ? "w-4 h-4" : "w-3.5 h-3.5";

  return (
    <Badge
      variant={variant}
      size={size}
      icon={showIcon ? <Icon className={iconSizeClass} /> : undefined}
      className={className}
    >
      {displayLabel}
    </Badge>
  );
}

export type InventoryModel = "vmi" | "trading" | "customer_owned";

export interface InventoryModelBadgeProps {
  model: InventoryModel | string;
  size?: BadgeSize;
  className?: string;
}

export function InventoryModelBadge({
  model,
  size = "md",
  className = "",
}: InventoryModelBadgeProps) {
  const normalized = model.toLowerCase().replace(/[\s-]/g, "_");

  let variant: "primary" | "secondary" | "neutral" = "primary";
  let label = "VMI";
  let Icon = Boxes;

  if (normalized === "trading") {
    variant = "secondary";
    label = "Trading";
    Icon = ArrowDownUp;
  } else if (normalized === "customer_owned" || normalized === "customer-owned" || normalized === "consignment") {
    variant = "neutral";
    label = "Customer-Owned";
    Icon = Layers;
  } else {
    variant = "primary";
    label = "VMI";
    Icon = Boxes;
  }

  const iconSizeClass = size === "sm" ? "w-3 h-3" : size === "lg" ? "w-4 h-4" : "w-3.5 h-3.5";

  return (
    <Badge
      variant={variant}
      size={size}
      icon={<Icon className={iconSizeClass} />}
      className={className}
    >
      {label}
    </Badge>
  );
}

export type UserRole =
  | "administrator"
  | "supervisor"
  | "warehouse_staff"
  | "organization_user";

export interface RoleBadgeProps {
  role: UserRole | string;
  size?: BadgeSize;
  className?: string;
}

export function RoleBadge({ role, size = "md", className = "" }: RoleBadgeProps) {
  const normalized = role.toLowerCase().replace(/[\s-]/g, "_");

  let variant: "primary" | "secondary" | "neutral" | "warning" = "primary";
  let label = "Staff";
  let Icon = HardHat;

  switch (normalized) {
    case "administrator":
    case "admin":
      variant = "primary";
      label = "Administrator";
      Icon = Shield;
      break;

    case "supervisor":
      variant = "secondary";
      label = "Supervisor";
      Icon = UserCheck;
      break;

    case "warehouse_staff":
    case "staff":
    case "warehouseman":
      variant = "neutral";
      label = "Warehouse Staff";
      Icon = HardHat;
      break;

    case "organization_user":
    case "party_user":
    case "client":
    case "vendor":
      variant = "warning";
      label = "Organization User";
      Icon = Building2;
      break;

    default:
      variant = "neutral";
      label = role.replace(/_/g, " ");
      Icon = UserCheck;
      break;
  }

  const iconSizeClass = size === "sm" ? "w-3 h-3" : size === "lg" ? "w-4 h-4" : "w-3.5 h-3.5";

  return (
    <Badge
      variant={variant}
      size={size}
      icon={<Icon className={iconSizeClass} />}
      className={className}
    >
      {label}
    </Badge>
  );
}
