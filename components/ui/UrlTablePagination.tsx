"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { TablePagination } from "./TablePagination";

export interface UrlTablePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  pageParamName?: string;
  className?: string;
}

export function UrlTablePagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  pageParamName = "page",
  className = "",
}: UrlTablePaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams ? searchParams.toString() : "");
    params.set(pageParamName, String(newPage));
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <TablePagination
      currentPage={currentPage}
      totalPages={totalPages}
      totalItems={totalItems}
      pageSize={pageSize}
      onPageChange={handlePageChange}
      className={className}
    />
  );
}
