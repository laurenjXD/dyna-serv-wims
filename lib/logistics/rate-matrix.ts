// `lib/logistics/rate-matrix.ts` — Predefined Effective Logistics Rate Matrix by Vehicle Type and Destination.

export type VehicleType =
  | "4-Wheeler"
  | "6-Wheeler"
  | "6-Wheeler Forward"
  | "10-Wheeler Forward"
  | "Customer Pick-up (Self-service)";

export const VEHICLE_TYPES: readonly VehicleType[] = [
  "4-Wheeler",
  "6-Wheeler",
  "6-Wheeler Forward",
  "10-Wheeler Forward",
  "Customer Pick-up (Self-service)",
] as const;

export interface LogisticsRateEntry {
  destination: string;
  rates: Partial<Record<VehicleType, number>>;
  defaultVehicle: VehicleType;
}

// Predefined Effective Contract Rate Matrix (PHP)
export const LOGISTICS_RATE_MATRIX: Record<string, LogisticsRateEntry> = {
  "UPI — Clark Facility": {
    destination: "UPI — Clark Facility",
    defaultVehicle: "10-Wheeler Forward",
    rates: {
      "10-Wheeler Forward": 7230.0,
      "6-Wheeler Forward": 5500.0,
      "6-Wheeler": 4000.0,
      "4-Wheeler": 2500.0,
      "Customer Pick-up (Self-service)": 0.0,
    },
  },
  "UPI — Cavite Assembly Plant A": {
    destination: "UPI — Cavite Assembly Plant A",
    defaultVehicle: "6-Wheeler Forward",
    rates: {
      "10-Wheeler Forward": 4500.0,
      "6-Wheeler Forward": 3000.0,
      "6-Wheeler": 2000.0,
      "4-Wheeler": 600.0,
      "Customer Pick-up (Self-service)": 0.0,
    },
  },
  "UPI — Calamba Storage Hub": {
    destination: "UPI — Calamba Storage Hub",
    defaultVehicle: "4-Wheeler",
    rates: {
      "10-Wheeler Forward": 3500.0,
      "6-Wheeler Forward": 1800.0,
      "6-Wheeler": 1200.0,
      "4-Wheeler": 600.0,
      "Customer Pick-up (Self-service)": 0.0,
    },
  },
  "AMPLEON (Laguna)": {
    destination: "AMPLEON (Laguna)",
    defaultVehicle: "6-Wheeler Forward",
    rates: {
      "10-Wheeler Forward": 5000.0,
      "6-Wheeler Forward": 3470.0,
      "6-Wheeler": 1500.0,
      "4-Wheeler": 800.0,
      "Customer Pick-up (Self-service)": 0.0,
    },
  },
  "AMERTRON (Cavite)": {
    destination: "AMERTRON (Cavite)",
    defaultVehicle: "6-Wheeler",
    rates: {
      "10-Wheeler Forward": 4000.0,
      "6-Wheeler Forward": 2500.0,
      "6-Wheeler": 1500.0,
      "4-Wheeler": 600.0,
      "Customer Pick-up (Self-service)": 0.0,
    },
  },
  "DSGC (Main Warehouse)": {
    destination: "DSGC (Main Warehouse)",
    defaultVehicle: "6-Wheeler Forward",
    rates: {
      "10-Wheeler Forward": 3500.0,
      "6-Wheeler Forward": 2000.0,
      "6-Wheeler": 1000.0,
      "4-Wheeler": 500.0,
      "Customer Pick-up (Self-service)": 0.0,
    },
  },
  "ADGT (Gateway Business Park)": {
    destination: "ADGT (Gateway Business Park)",
    defaultVehicle: "4-Wheeler",
    rates: {
      "10-Wheeler Forward": 3500.0,
      "6-Wheeler Forward": 2000.0,
      "6-Wheeler": 1200.0,
      "4-Wheeler": 600.0,
      "Customer Pick-up (Self-service)": 0.0,
    },
  },
  "ATP (LISP II)": {
    destination: "ATP (LISP II)",
    defaultVehicle: "4-Wheeler",
    rates: {
      "10-Wheeler Forward": 3500.0,
      "6-Wheeler Forward": 2200.0,
      "6-Wheeler": 1400.0,
      "4-Wheeler": 700.0,
      "Customer Pick-up (Self-service)": 0.0,
    },
  },
  "ST (Calamba)": {
    destination: "ST (Calamba)",
    defaultVehicle: "4-Wheeler",
    rates: {
      "10-Wheeler Forward": 3500.0,
      "6-Wheeler Forward": 1800.0,
      "6-Wheeler": 1200.0,
      "4-Wheeler": 600.0,
      "Customer Pick-up (Self-service)": 0.0,
    },
  },
};

/**
 * Looks up the pre-defined standard logistics delivery charge (PHP) for a given destination and vehicle type.
 */
export function lookupEffectiveLogisticsRate(
  destination: string,
  vehicleType: VehicleType | string,
): number {
  if (vehicleType === "Customer Pick-up (Self-service)") {
    return 0.0;
  }

  // Exact match
  const exactEntry = LOGISTICS_RATE_MATRIX[destination];
  if (exactEntry && exactEntry.rates[vehicleType as VehicleType] !== undefined) {
    return exactEntry.rates[vehicleType as VehicleType]!;
  }

  // Normalized fuzzy lookup
  const normalizedDest = destination.toLowerCase();
  for (const [key, entry] of Object.entries(LOGISTICS_RATE_MATRIX)) {
    if (
      normalizedDest.includes(key.toLowerCase()) ||
      key.toLowerCase().includes(normalizedDest) ||
      (normalizedDest.includes("clark") && key.includes("Clark")) ||
      (normalizedDest.includes("cavite") && key.includes("Cavite")) ||
      (normalizedDest.includes("calamba") && key.includes("Calamba")) ||
      (normalizedDest.includes("ampleon") && key.includes("AMPLEON")) ||
      (normalizedDest.includes("amertron") && key.includes("AMERTRON")) ||
      (normalizedDest.includes("dsgc") && key.includes("DSGC"))
    ) {
      if (entry.rates[vehicleType as VehicleType] !== undefined) {
        return entry.rates[vehicleType as VehicleType]!;
      }
    }
  }

  // Fallback defaults by vehicle type if destination is unmapped
  switch (vehicleType) {
    case "10-Wheeler Forward":
      return 7230.0;
    case "6-Wheeler Forward":
      return 2500.0;
    case "6-Wheeler":
      return 1500.0;
    case "4-Wheeler":
      return 600.0;
    default:
      return 0.0;
  }
}
