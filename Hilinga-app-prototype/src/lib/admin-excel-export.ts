import type { AdminTouristStats } from "@/lib/analytics-service";
import type ExcelJS from "exceljs";

function formatMonth(monthStr: string): string {
  const d = new Date(`${monthStr}-01T00:00:00`);
  return d.toLocaleDateString("en-PH", { month: "short", year: "numeric" });
}

const GREEN = "FF18452D";
const GREEN_LIGHT = "FFECFDF5";
const AMBER = "FFF59E0B";
const GREY_LINE = "FFE5E7EB";
const WHITE = "FFFFFFFF";

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
    cell.font = { color: { argb: WHITE }, bold: true, size: 11, name: "Inter" };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: GREY_LINE } },
      left: { style: "thin", color: { argb: GREY_LINE } },
      bottom: { style: "thin", color: { argb: GREY_LINE } },
      right: { style: "thin", color: { argb: GREY_LINE } },
    };
  });
  row.height = 22;
  row.commit();
}

function styleDataRow(row: ExcelJS.Row, idx: number) {
  const isAlt = idx % 2 === 0;
  row.eachCell((cell) => {
    if (isAlt) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAF8" } } as ExcelJS.Fill;
    } else {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } } as ExcelJS.Fill;
    }
    cell.font = { size: 11, name: "Inter", color: { argb: "FF1F2937" } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: GREY_LINE } },
      left: { style: "thin", color: { argb: GREY_LINE } },
      bottom: { style: "thin", color: { argb: GREY_LINE } },
      right: { style: "thin", color: { argb: GREY_LINE } },
    };
  });
  row.height = 18;
  row.commit();
}

export async function downloadAdminExcel(stats: AdminTouristStats): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Hilinga";
  wb.lastModifiedBy = "Hilinga Admin";
  wb.created = new Date();
  wb.modified = new Date();
  wb.properties.date1904 = false;

  // ── Summary sheet ──
  const wsSummary = wb.addWorksheet("Summary", {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: GREEN } },
  });
  wsSummary.columns = [
    { header: "", key: "a", width: 28 },
    { header: "", key: "b", width: 22 },
  ];

  // Title block
  const titleRow = wsSummary.addRow(["HILINGA  —  Tourism Analytics Report"]);
  titleRow.getCell(1).font = { size: 16, bold: true, color: { argb: GREEN }, name: "Inter" };
  titleRow.getCell(1).alignment = { vertical: "middle" };
  titleRow.height = 26;
  wsSummary.mergeCells("A1:B1");

  const subRow = wsSummary.addRow([`Generated ${new Date().toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" })}  •  Last data refresh: ${stats.lastUpdated.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}`]);
  subRow.getCell(1).font = { size: 9, color: { argb: "FF6B7280" }, italic: true, name: "Inter" };
  wsSummary.mergeCells("A2:B2");

  wsSummary.addRow([]);
  const hdr = wsSummary.addRow(["Metric", "Value"]);
  styleHeaderRow(hdr);

  const avgPerMonth = Math.round(
    stats.totalVisits / Math.max(stats.monthlyTrend.filter((m) => m.count > 0).length, 1),
  );
  const rows: Array<[string, string | number]> = [
    ["Total arrivals", stats.totalVisits],
    ["Countries represented", stats.uniqueCountries],
    ["Peak month", stats.peakMonth ? `${formatMonth(stats.peakMonth.month)} (${stats.peakMonth.count.toLocaleString()} arrivals)` : "—"],
    ["Average per active month", avgPerMonth],
    ["Reporting window", "Last 12 months"],
  ];
  rows.forEach(([k, v], i) => {
    const r = wsSummary.addRow([k, v]);
    styleDataRow(r, i);
    r.getCell(1).font = { bold: true, size: 11, name: "Inter" };
    r.getCell(2).alignment = { horizontal: i === 0 || i === 3 ? "right" : "left", vertical: "middle" };
    if (typeof v === "number") {
      r.getCell(2).numFmt = "#,##0";
      r.getCell(2).alignment = { horizontal: "right", vertical: "middle" };
    }
  });

  wsSummary.addRow([]);
  const note = wsSummary.addRow(["Department of Tourism  •  Republic of the Philippines  —  Data updates in real-time via Supabase."]);
  note.getCell(1).font = { size: 8, color: { argb: "FF9CA3AF" }, name: "Inter" };
  wsSummary.mergeCells(`A${note.number}:B${note.number}`);

  wsSummary.getRow(1).commit();
  // Freeze below title
  wsSummary.views = [{ state: "frozen", ySplit: 4 }];

  // ── Monthly Trend ──
  const wsTrend = wb.addWorksheet("Monthly Trend", {
    properties: { tabColor: { argb: AMBER } },
  });
  wsTrend.columns = [
    { header: "Month", key: "month", width: 18 },
    { header: "Tourist Arrivals", key: "count", width: 18 },
  ];
  const trendHeader = wsTrend.getRow(1);
  trendHeader.values = ["Month", "Tourist Arrivals"];
  styleHeaderRow(trendHeader);
  wsTrend.autoFilter = "A1:B1";
  wsTrend.views = [{ state: "frozen", ySplit: 1 }];

  stats.monthlyTrend.forEach((item, i) => {
    const r = wsTrend.addRow([formatMonth(item.month), item.count]);
    styleDataRow(r, i);
    r.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
    r.getCell(2).numFmt = "#,##0";
    r.getCell(2).alignment = { horizontal: "right", vertical: "middle" };
  });
  // Total row
  const totalRow = wsTrend.addRow(["TOTAL (12 mo)", stats.totalVisits]);
  totalRow.eachCell((cell, col) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_LIGHT } };
    cell.font = { bold: true, size: 11, color: { argb: GREEN }, name: "Inter" };
    cell.border = {
      top: { style: "medium", color: { argb: GREEN } },
      left: { style: "thin", color: { argb: GREY_LINE } },
      bottom: { style: "thin", color: { argb: GREY_LINE } },
      right: { style: "thin", color: { argb: GREY_LINE } },
    };
    cell.alignment = { vertical: "middle", horizontal: col === 2 ? "right" : "left" };
  });
  if (typeof totalRow.getCell(2).value === "number") {
    totalRow.getCell(2).numFmt = "#,##0";
  }
  totalRow.commit();
  totalRow.height = 20;

  // ── Top Countries ──
  const wsCountries = wb.addWorksheet("Top Countries", {
    properties: { tabColor: { argb: "FF0EA5E9" } },
  });
  wsCountries.columns = [
    { header: "Rank", key: "rank", width: 8 },
    { header: "Country", key: "country", width: 28 },
    { header: "Arrivals", key: "count", width: 16 },
  ];
  const cHdr = wsCountries.getRow(1);
  cHdr.values = ["Rank", "Country", "Arrivals"];
  styleHeaderRow(cHdr);
  wsCountries.autoFilter = "A1:C1";
  wsCountries.views = [{ state: "frozen", ySplit: 1 }];
  if (stats.topCountries.length === 0) {
    const r = wsCountries.addRow(["—", "No data yet", "—"]);
    styleDataRow(r, 0);
  } else {
    stats.topCountries.forEach((item, i) => {
      const r = wsCountries.addRow([i + 1, item.country, item.count]);
      styleDataRow(r, i);
      r.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      r.getCell(2).alignment = { horizontal: "left", vertical: "middle" };
      r.getCell(3).numFmt = "#,##0";
      r.getCell(3).alignment = { horizontal: "right", vertical: "middle" };
      if (i < 3) {
        r.getCell(1).font = { bold: true, color: { argb: GREEN }, size: 11, name: "Inter" };
      }
    });
  }

  // ── Top Provinces ──
  const wsProv = wb.addWorksheet("Top Provinces", {
    properties: { tabColor: { argb: "FF10B981" } },
  });
  wsProv.columns = [
    { header: "Rank", key: "rank", width: 8 },
    { header: "Province", key: "province", width: 28 },
    { header: "Visitors", key: "count", width: 16 },
  ];
  const pHdr = wsProv.getRow(1);
  pHdr.values = ["Rank", "Province", "Visitors"];
  styleHeaderRow(pHdr);
  wsProv.autoFilter = "A1:C1";
  wsProv.views = [{ state: "frozen", ySplit: 1 }];
  if (stats.topProvinces.length === 0) {
    const r = wsProv.addRow(["—", "No data yet", "—"]);
    styleDataRow(r, 0);
  } else {
    stats.topProvinces.forEach((item, i) => {
      const r = wsProv.addRow([i + 1, item.province, item.count]);
      styleDataRow(r, i);
      r.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      r.getCell(2).alignment = { horizontal: "left", vertical: "middle" };
      r.getCell(3).numFmt = "#,##0";
      r.getCell(3).alignment = { horizontal: "right", vertical: "middle" };
      if (i < 3) {
        r.getCell(1).font = { bold: true, color: { argb: GREEN }, size: 11, name: "Inter" };
      }
    });
  }

  // Print setup for all sheets
  [wsSummary, wsTrend, wsCountries, wsProv].forEach((ws) => {
    ws.pageSetup = {
      paperSize: 9, // A4
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
    } as unknown as ExcelJS.PageSetup;
    ws.headerFooter.oddHeader = "&C&11&K18452D Hilinga — Government Tourism Analytics";
    ws.headerFooter.oddFooter = "&C&8Generated &D  •  Page &P of &N";
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hilinga-tourism-report-${new Date().toISOString().split("T")[0]}.xlsx`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // cleanup after click
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1500);
}
