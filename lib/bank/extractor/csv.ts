export function splitCSVRow(line: string, delimiter: string = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 5).join('\n');
  const commas = (sample.match(/,/g) || []).length;
  const tabs = (sample.match(/\t/g) || []).length;
  const pipes = (sample.match(/\|/g) || []).length;
  
  if (tabs > commas && tabs > pipes) return '\t';
  if (pipes > commas && pipes > tabs) return '|';
  return ',';
}

export function extractCSVRows(rawCSV: string): string[][] {
  // Use actual newline characters, handling \r\n as well
  const lines = rawCSV.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines);
  return lines.map(line => splitCSVRow(line, delimiter));
}
