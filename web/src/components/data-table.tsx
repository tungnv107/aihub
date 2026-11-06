"use client";
import { useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Empty } from "./ui";
import { useText } from "./providers";
export function DataTable<T>({
  rows,
  columns,
  page = 1,
  total = rows.length,
  onPage,
}: {
  rows: T[];
  columns: ColumnDef<T>[];
  page?: number;
  total?: number;
  onPage?: (page: number) => void;
}) {
  const t = useText(),
    [sorting, setSorting] = useState<SortingState>([]),
    // TanStack Table owns its own state; this component is intentionally not compiler memoized.
    // eslint-disable-next-line react-hooks/incompatible-library
    table = useReactTable({
      data: rows,
      columns,
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
      state: { sorting },
      onSortingChange: setSorting,
    });
  if (!rows.length)
    return (
      <Empty
        title={t("Chưa có dữ liệu", "No records yet")}
        description={t(
          "Các mục mới sẽ xuất hiện tại đây. Hãy thử thay đổi bộ lọc nếu đang tìm kiếm.",
          "New records will appear here. Try adjusting your search if a filter is active.",
        )}
      />
    );
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id}>
                    {header.column.getCanSort() ? (
                      <button
                        className="row"
                        style={{
                          border: 0,
                          background: "transparent",
                          padding: 0,
                          color: "inherit",
                          fontSize: "inherit",
                        }}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        <ArrowUpDown size={11} />
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onPage && (
        <div className="pagination">
          <span>
            {t("Trang", "Page")} {page} · {total} {t("kết quả", "records")}
          </span>
          <div className="row">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
            >
              <ChevronLeft size={13} />
              {t("Trước", "Previous")}
            </Button>
            <Button
              variant="secondary"
              disabled={page * 20 >= total}
              onClick={() => onPage(page + 1)}
            >
              {t("Tiếp", "Next")}
              <ChevronRight size={13} />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
