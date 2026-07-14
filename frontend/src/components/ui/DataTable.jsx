import { useMemo, useState } from "react";
import {
  Box,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  IconButton,
} from "@mui/material";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * DataTable — UI Kit Section 10, standardized table with pagination.
 *
 * @param {Array}    columns     Array of { key, label, align?, render?, width? }
 * @param {Array}    data        Array of row objects
 * @param {boolean}  pagination  Enable pagination (default: true)
 * @param {number}   pageSize    Rows per page (default: 10)
 * @param {function} onRowClick  Optional row click handler (receives row)
 * @param {object}   sx          Additional MUI sx overrides
 */
export default function DataTable({
  columns = [],
  data = [],
  pagination = true,
  pageSize = 10,
  onRowClick,
  sx = {},
}) {
  const [page, setPage] = useState(0);

  const totalPages = Math.ceil(data.length / pageSize);
  const paginatedData = useMemo(
    () => (pagination ? data.slice(page * pageSize, (page + 1) * pageSize) : data),
    [data, page, pageSize, pagination]
  );

  const handlePrev = () => setPage((p) => Math.max(0, p - 1));
  const handleNext = () => setPage((p) => Math.min(totalPages - 1, p + 1));

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--border-color)",
        overflow: "hidden",
        backgroundColor: "var(--bg-card)",
        boxShadow: "0 4px 20px rgba(13, 87, 183, 0.03)",
        ...sx,
      }}
    >
      <Box sx={{ overflow: "auto" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  align={col.align || "left"}
                  sx={{
                    backgroundColor: "var(--bg-surface)",
                    color: "var(--deep-navy)",
                    fontWeight: "var(--font-weight-bold)",
                    fontSize: "var(--font-body2)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    borderBottom: "1px solid var(--border-color)",
                    py: 1.5,
                    px: 2,
                    whiteSpace: "nowrap",
                    ...(col.width ? { width: col.width } : {}),
                  }}
                >
                  {col.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedData.map((row, rowIdx) => (
              <TableRow
                key={row.id || rowIdx}
                hover
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                sx={{
                  cursor: onRowClick ? "pointer" : "default",
                  transition: "background 0.15s ease",
                  "&:hover": { backgroundColor: "rgba(13, 87, 183, 0.03)" },
                  "&:last-child td": { borderBottom: "none" },
                }}
              >
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    align={col.align || "left"}
                    sx={{
                      fontSize: "var(--font-body1)",
                      fontWeight: "var(--font-weight-medium)",
                      color: "var(--text-primary)",
                      borderBottom: "1px solid #F1F5F9",
                      py: 1.4,
                      px: 2,
                    }}
                  >
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {paginatedData.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  sx={{
                    textAlign: "center",
                    py: 5,
                    color: "var(--text-muted)",
                    fontWeight: "var(--font-weight-medium)",
                  }}
                >
                  No data available
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>

      {/* Pagination */}
      {pagination && totalPages > 1 && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            px: 2.5,
            py: 1.5,
            borderTop: "1px solid var(--border-color)",
          }}
        >
          <Typography
            sx={{
              fontSize: "var(--font-body2)",
              color: "var(--text-secondary)",
              fontWeight: "var(--font-weight-medium)",
            }}
          >
            Showing {page * pageSize + 1} to{" "}
            {Math.min((page + 1) * pageSize, data.length)} of {data.length}{" "}
            entries
          </Typography>

          <Stack direction="row" alignItems="center" spacing={0.5}>
            <IconButton
              size="small"
              disabled={page === 0}
              onClick={handlePrev}
              sx={{
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-md)",
                width: 32,
                height: 32,
              }}
            >
              <ChevronLeft size={16} />
            </IconButton>

            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i;
              } else if (page < 3) {
                pageNum = i;
              } else if (page > totalPages - 4) {
                pageNum = totalPages - 5 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <Box
                  key={pageNum}
                  component="button"
                  onClick={() => setPage(pageNum)}
                  sx={{
                    width: 32,
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "var(--radius-md)",
                    border:
                      pageNum === page
                        ? "1.5px solid var(--grid-blue)"
                        : "1px solid var(--border-color)",
                    backgroundColor:
                      pageNum === page ? "var(--grid-blue)" : "transparent",
                    color:
                      pageNum === page ? "#FFFFFF" : "var(--text-primary)",
                    fontSize: "var(--font-body2)",
                    fontWeight: "var(--font-weight-bold)",
                    fontFamily: "inherit",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    outline: "none",
                    "&:hover": {
                      borderColor: "var(--grid-blue)",
                    },
                  }}
                >
                  {pageNum + 1}
                </Box>
              );
            })}

            <IconButton
              size="small"
              disabled={page >= totalPages - 1}
              onClick={handleNext}
              sx={{
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-md)",
                width: 32,
                height: 32,
              }}
            >
              <ChevronRight size={16} />
            </IconButton>
          </Stack>
        </Stack>
      )}
    </Paper>
  );
}
