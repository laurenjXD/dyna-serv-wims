import type { ReactNode, SVGProps } from "react";

export type BrandIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  strokeWidth?: number;
};

function Icon({ children, size = 24, strokeWidth = 2.6, ...props }: BrandIconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** PDF icon set: 01 ELSE / Logistics. */
export function ElseIcon(props: BrandIconProps) {
  return (
    <Icon {...props}>
      <path d="M7 16h25v14H7z" />
      <path d="M32 20h6l4 5v5h-10z" />
      <path d="M13 30a4 4 0 1 0 8 0M33 30a4 4 0 1 0 8 0" />
      <path d="M7 20h17M36 20v5h6" />
    </Icon>
  );
}

/** PDF icon set: 02 EFE / Engineering and technical service. */
export function EfeIcon(props: BrandIconProps) {
  return (
    <Icon {...props}>
      <path d="m9 35 15-15" />
      <path d="m8 39 8-2 15-15-6-6L10 31z" />
      <path d="M29 9a9 9 0 0 0-2 10l6 6a9 9 0 0 0 10-2l-6-1-4-4z" />
    </Icon>
  );
}

/** PDF icon set: 03 VMI / Inventory grid. */
export function VmiIcon(props: BrandIconProps) {
  return (
    <Icon {...props}>
      <rect x="10" y="9" width="28" height="30" />
      <path d="M10 19h28M10 29h28M24 9v30" />
    </Icon>
  );
}

/** PDF icon set: 04 Testing / Semiconductor chip. */
export function TestingIcon(props: BrandIconProps) {
  return (
    <Icon {...props}>
      <rect x="14" y="14" width="20" height="20" rx="2" />
      <path d="M19 8v6M29 8v6M19 34v6M29 34v6M8 19h6M8 29h6M34 19h6M34 29h6" />
    </Icon>
  );
}

/** PDF icon set: 05 Fabrication / Sun and process. */
export function FabricationIcon(props: BrandIconProps) {
  return (
    <Icon {...props}>
      <circle cx="24" cy="24" r="8" />
      <path d="M24 6v5M24 37v5M6 24h5M37 24h5M11.3 11.3l3.5 3.5M33.2 33.2l3.5 3.5M36.7 11.3l-3.5 3.5M14.8 33.2l-3.5 3.5" />
    </Icon>
  );
}

/** PDF icon set: 06 Packaging / Carton. */
export function PackagingIcon(props: BrandIconProps) {
  return (
    <Icon {...props}>
      <path d="m8 15 16-8 16 8-16 8z" />
      <path d="M8 15v18l16 8 16-8V15M24 23v18M16 11l16 8" />
    </Icon>
  );
}

/** PDF icon set: 07 Quality / Verified shield. */
export function QualityIcon(props: BrandIconProps) {
  return (
    <Icon {...props}>
      <path d="M24 6 38 12v10c0 9-6 15-14 20C16 37 10 31 10 22V12z" />
      <path d="m17 24 5 5 10-11" />
    </Icon>
  );
}

/** PDF icon set: 08 Global / World network. */
export function GlobalIcon(props: BrandIconProps) {
  return (
    <Icon {...props}>
      <circle cx="24" cy="24" r="16" />
      <path d="M8 24h32M24 8c5 4 8 10 8 16s-3 12-8 16c-5-4-8-10-8-16s3-12 8-16z" />
    </Icon>
  );
}

/** Navigation companion icon: outbound movement. */
export function OutgoingIcon(props: BrandIconProps) {
  return (
    <Icon {...props}>
      <path d="M8 12h20v24H8z" />
      <path d="M28 24h12M34 18l6 6-6 6" />
      <path d="M13 12V8h14v4" />
    </Icon>
  );
}

/** Navigation companion icon: documents and records. */
export function DocumentIcon(props: BrandIconProps) {
  return (
    <Icon {...props}>
      <path d="M13 6h16l6 6v30H13z" />
      <path d="M29 6v8h6M18 23h12M18 30h12M18 37h8" />
    </Icon>
  );
}

/** Navigation companion icon: reporting and analytics. */
export function ReportsIcon(props: BrandIconProps) {
  return (
    <Icon {...props}>
      <path d="M8 40V26M20 40V16M32 40V8M44 40H5" />
      <path d="m8 20 12-8 12 3 12-9" />
    </Icon>
  );
}

/** Navigation companion icon: parties and enrollment. */
export function EnrollmentIcon(props: BrandIconProps) {
  return (
    <Icon {...props}>
      <circle cx="18" cy="17" r="6" />
      <circle cx="34" cy="19" r="5" />
      <path d="M7 38c0-7 5-11 11-11s11 4 11 11M30 29c6 0 10 3 11 9" />
    </Icon>
  );
}

/** Navigation companion icon: billing and pricing. */
export function BillingIcon(props: BrandIconProps) {
  return (
    <Icon {...props}>
      <rect x="9" y="8" width="30" height="32" rx="2" />
      <path d="M15 16h18M15 23h18M15 30h8M29 30h4" />
    </Icon>
  );
}

/** Navigation companion icon: user profile. */
export function ProfileIcon(props: BrandIconProps) {
  return (
    <Icon {...props}>
      <circle cx="24" cy="16" r="7" />
      <path d="M10 40c1-8 6-12 14-12s13 4 14 12" />
    </Icon>
  );
}

/** Navigation icon: account and application settings. */
export function SettingsIcon(props: BrandIconProps) {
  return (
    <Icon {...props}>
      <circle cx="24" cy="24" r="6" />
      <path d="M39 27.5c.2-1.1.2-2.2 0-3.3l4-3.1-4-6.9-4.8 2a15 15 0 0 0-2.9-1.7L30.7 9h-8l-.6 5.5c-1 .4-2 .9-2.9 1.7l-4.8-2-4 6.9 4 3.1a13 13 0 0 0 0 3.6l-4 3.1 4 6.9 4.8-2c.9.7 1.9 1.3 2.9 1.7l.6 5.5h8l.6-5.5c1-.4 2-1 2.9-1.7l4.8 2 4-6.9z" />
    </Icon>
  );
}
