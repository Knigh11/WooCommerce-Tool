/**
 * CSV writer that outputs downloadable file (mirrors desktop writer.py)
 */

import type { CsvRow } from "./types";

/**
 * Escape CSV field value
 */
function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Convert rows to CSV string with UTF-8 BOM (Excel friendly)
 */
export function rowsToCsv(rows: CsvRow[]): string {
  const bom = "\uFEFF"; // UTF-8 BOM
  const header = ["Title", "Style", "Color", "Size", "Price", "Image", "Description"];
  const lines: string[] = [bom + header.map(escapeCsvField).join(",")];

  for (const row of rows) {
    const values = [
      row.title,
      row.style,
      row.color,
      row.size,
      row.price,
      row.image,
      row.description,
    ];
    lines.push(values.map(escapeCsvField).join(","));
  }

  return lines.join("\n");
}

/**
 * Download CSV file
 */
export function downloadCsv(rows: CsvRow[], filename: string = "csv_generator_output.csv"): void {
  const csvContent = rowsToCsv(rows);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

