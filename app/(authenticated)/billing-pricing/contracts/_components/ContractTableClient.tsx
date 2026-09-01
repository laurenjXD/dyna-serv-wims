"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, Filter } from "lucide-react";

export interface ContractItem {
  id: string;
  contractNumber: string;
  partyId: string;
  partyName: string;
  contractType: "vmi" | "trading" | "vmi_trading";
  status: "draft" | "active" | "suspended" | "pending_approval" | "terminated" | "expired";
  effectiveDate: string;
  expirationDate: string | null;
  currency: string;
  paymentTerms?: string;
  createdAt: Date;
}

interface ContractTableClientProps {
  initialContracts: ContractItem[];
}

export function ContractTableClient({ initialContracts }: ContractTableClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filteredContracts = useMemo(() => {
    return initialContracts.filter((c) => {
      const matchesSearch =
        c.contractNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.partyName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === "" || c.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [initialContracts, searchTerm, statusFilter]);

  return (
    <div className="overflow-hidden rounded-card bg-surface-white border border-border-light shadow-card">
      <div className="border-b border-border-light bg-surface-background p-4 flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-grey" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search contract # or customer..."
            className="w-full rounded-btn border border-border-medium bg-surface-white pl-9 pr-3 py-1.5 font-body text-body-sm focus:border-brand-blue focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter size={16} className="text-text-grey" />
          <span className="font-body text-body-sm text-text-grey">Filter:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-btn border border-border-medium bg-surface-white px-3 py-1.5 font-body text-body-sm"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="pending_approval">Pending Approval</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border-light bg-surface-background text-text-grey font-body text-body-xs uppercase tracking-wider">
              <th className="py-3 px-4">Contract #</th>
              <th className="py-3 px-4">Organization (Customer)</th>
              <th className="py-3 px-4">Contract Type</th>
              <th className="py-3 px-4">Effective Date</th>
              <th className="py-3 px-4">Expiration Date</th>
              <th className="py-3 px-4">Currency</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light font-body text-body-sm text-text-dark">
            {filteredContracts.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-text-grey">
                  {initialContracts.length === 0
                    ? "No commercial contracts configured yet. Click \"New Contract\" to define your first rate-card contract."
                    : "No contracts match your search or filter criteria."}
                </td>
              </tr>
            ) : (
              filteredContracts.map((contract) => (
                <tr key={contract.id} className="hover:bg-surface-background/50 transition-colors">
                  <td className="py-3.5 px-4 font-mono text-mono-md font-semibold text-brand-blue">
                    <Link href={`/billing-pricing/contracts/${contract.id}`}>
                      {contract.contractNumber}
                    </Link>
                  </td>
                  <td className="py-3.5 px-4 font-medium">{contract.partyName}</td>
                  <td className="py-3.5 px-4 uppercase text-body-xs font-semibold text-text-grey">
                    {contract.contractType.replace("_", " + ")}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-mono-sm">{contract.effectiveDate}</td>
                  <td className="py-3.5 px-4 font-mono text-mono-sm">
                    {contract.expirationDate ?? "Open-ended"}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-mono-sm">{contract.currency}</td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-body-xs font-semibold ${
                        contract.status === "active"
                          ? "bg-green-100 text-green-800"
                          : contract.status === "draft"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {contract.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <Link
                      href={`/billing-pricing/contracts/${contract.id}`}
                      className="inline-flex items-center font-body text-body-xs font-semibold text-brand-blue hover:underline"
                    >
                      View & Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
