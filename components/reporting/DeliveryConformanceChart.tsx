"use client";

import Link from "next/link";
import {
  LineChart,
  Line,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { CheckCircle2, ExternalLink } from "lucide-react";
import type { DeliveryConformanceTrendDatum } from "@/lib/analytics/queries/conformance";

export interface DeliveryConformanceChartProps {
  data: DeliveryConformanceTrendDatum[];
  currentRate?: number;
  targetRate?: number;
}

export function DeliveryConformanceChart({
  data,
  currentRate = 98.5,
  targetRate = 98.0,
}: DeliveryConformanceChartProps) {
  const formattedData = data.map((d) => ({
    ...d,
    label: d.period.includes("T") ? d.period.slice(5, 10) : d.period,
  }));

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/20 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-status-available/10 text-status-available">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <h3 className="font-heading text-title-md font-bold text-on-surface">
                Delivery Conformance &amp; OTIF Trend
              </h3>
              <p className="font-body text-body-xs text-text-grey">
                Percentage of outbound dispatches with verified physical Proof of Delivery (POD/DR)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-surface-light-grey px-3 py-1.5 font-label text-label font-bold text-on-surface">
            <span>Live Conformance:</span>
            <span
              className={
                currentRate >= targetRate
                  ? "text-status-available"
                  : currentRate >= 90
                  ? "text-status-pending"
                  : "text-status-held"
              }
            >
              {currentRate.toFixed(1)}%
            </span>
          </div>

          <Link
            href="/outgoing?tab=ledger"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-white px-3 font-label text-label font-semibold text-brand-navy hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            <span>Outgoing Ledger</span>
            <ExternalLink size={13} />
          </Link>
        </div>
      </div>

      <div className="mt-4 h-64 w-full">
        {formattedData.length === 0 ? (
          <div className="flex h-full items-center justify-center font-body text-body-sm text-text-grey">
            No outbound delivery data in this time period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={formattedData}
              margin={{ top: 15, right: 20, left: -20, bottom: 5 }}
            >
              <CartesianGrid vertical={false} stroke="#E2E8F0" strokeOpacity={0.6} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#64748B", fontSize: 11 }}
              />
              <YAxis
                domain={[80, 100]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#64748B", fontSize: 11 }}
                tickFormatter={(val) => `${val}%`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload as DeliveryConformanceTrendDatum & { label: string };
                    return (
                      <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-3 shadow-elevation-2 font-body text-body-xs">
                        <p className="font-bold text-on-surface mb-1">
                          Period: {item.period.slice(0, 10)}
                        </p>
                        <p className="text-brand-navy font-bold">
                          Conformance Rate: {item.conformanceRate}%
                        </p>
                        <p className="text-text-grey">
                          Conforming Dispatches: {item.conformingCount} / {item.totalDispatched}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine
                y={targetRate}
                stroke="#10B981"
                strokeDasharray="4 4"
                label={{
                  value: `Target (${targetRate}%)`,
                  fill: "#10B981",
                  fontSize: 10,
                  position: "right",
                }}
              />
              <Line
                type="monotone"
                dataKey="conformanceRate"
                stroke="#002060"
                strokeWidth={2.5}
                dot={{ fill: "#002060", r: 3 }}
                activeDot={{ r: 5, fill: "#2563EB" }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
