import * as xlsx from 'xlsx';

export function extractExcelRows(buffer: Buffer): string[][] {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  // Convert sheet to an array of arrays (CSV-like grid)
  const rows: any[][] = xlsx.utils.sheet_to_json(worksheet, { header: 1, raw: false });
  
  // Convert all cells to strings to match our expected grid format
  return rows.map(row => row.map(cell => cell !== undefined && cell !== null ? String(cell).trim() : ''));
}
