/**
 * Bug Location Finder
 * Searches codebase for problematic patterns identified in forensic audit
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

interface BugMatch {
  bug: string;
  file: string;
  line: number;
  content: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
}

const matches: BugMatch[] = [];

console.log('='.repeat(80));
console.log('🔍 SEARCHING FOR BUG PATTERNS IN CODE');
console.log('='.repeat(80));
console.log('\n');

// Helper to search files
function searchPattern(pattern: RegExp, description: string, severity: 'CRITICAL' | 'HIGH' | 'MEDIUM', extensions: string[] = ['ts', 'tsx', 'js', 'jsx']) {
  console.log(`\nSearching: ${description}`);
  console.log(`Pattern: ${pattern}`);
  console.log('─'.repeat(80));
  
  const extPattern = extensions.map(e => `**/*.${e}`).join(' ');
  const files = execSync(`dir /s /b *.ts *.tsx 2>nul || echo ""`, { cwd: process.cwd(), encoding: 'utf8' })
    .split('\n')
    .filter(f => f.trim() && !f.includes('node_modules') && !f.includes('.next'));

  let found = 0;

  for (const file of files) {
    const filePath = file.trim();
    if (!filePath || !fs.existsSync(filePath)) continue;

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        if (pattern.test(line)) {
          found++;
          matches.push({
            bug: description,
            file: path.relative(process.cwd(), filePath),
            line: idx + 1,
            content: line.trim().substring(0, 80),
            severity
          });
          console.log(`  ❌ ${path.relative(process.cwd(), filePath)}:${idx + 1}`);
          console.log(`     ${line.trim().substring(0, 100)}`);
        }
      });
    } catch (e) {
      // Skip files we can't read
    }
  }

  if (found === 0) {
    console.log('  ✅ No matches found');
  } else {
    console.log(`\n  Total matches: ${found}`);
  }
}

// BUG #1: Queries using expenses.category (should use category_id + JOIN)
searchPattern(
  /\bexpenses\b.*\bcategory[^_\s]/i,
  'BUG-001: expenses.category column usage (does not exist)',
  'CRITICAL'
);

searchPattern(
  /SELECT.*category.*FROM expenses/i,
  'BUG-001b: SELECT category FROM expenses',
  'CRITICAL'
);

searchPattern(
  /GROUP BY.*category/i,
  'BUG-001c: GROUP BY category (needs JOIN)',
  'CRITICAL'
);

// BUG #2: Settings table references
searchPattern(
  /FROM\s+settings/i,
  'BUG-002: settings table query (table does not exist)',
  'CRITICAL'
);

searchPattern(
  /INSERT\s+INTO\s+settings/i,
  'BUG-002b: INSERT INTO settings (table does not exist)',
  'CRITICAL'
);

searchPattern(
  /UPDATE\s+settings/i,
  'BUG-002c: UPDATE settings (table does not exist)',
  'CRITICAL'
);

// BUG #3: Budget month as string
searchPattern(
  /month\s*=\s*['"`]\d{4}-\d{2}['"`]/i,
  'BUG-003: Budget month as string YYYY-MM (DB uses separate int fields)',
  'CRITICAL'
);

searchPattern(
  /WHERE.*month.*['"`]\d{4}-\d{2}/i,
  'BUG-003b: Budget month query with YYYY-MM format',
  'CRITICAL'
);

// BUG #4: Goal completion without validation
searchPattern(
  /status\s*=\s*['"`]completed['"`]/i,
  'BUG-004: Setting goal status to completed (check if saved >= target)',
  'HIGH'
);

searchPattern(
  /UPDATE\s+goals.*completed/i,
  'BUG-004b: Updating goal to completed',
  'HIGH'
);

// BUG #5: Allowing NULL category_id in budgets
searchPattern(
  /INSERT\s+INTO\s+budgets/i,
  'BUG-005: Budget INSERT (verify category_id NOT NULL)',
  'HIGH'
);

// Missing JOINs for category names
searchPattern(
  /SELECT.*FROM\s+expenses(?!.*JOIN.*categories)/i,
  'BUG-006: Expense query without JOIN to categories (category will be undefined)',
  'MEDIUM'
);

// Direct table access patterns
searchPattern(
  /db\.query.*expenses/i,
  'INFO: Direct expense query (review for category JOIN)',
  'MEDIUM'
);

searchPattern(
  /execute.*expenses/i,
  'INFO: Execute expense query (review for category JOIN)',
  'MEDIUM'
);

// Budget queries
searchPattern(
  /SELECT.*FROM\s+budgets/i,
  'INFO: Budget query (verify month/year handling)',
  'MEDIUM'
);

// Goal status updates
searchPattern(
  /UPDATE.*goals.*status/i,
  'INFO: Goal status update (verify completion logic)',
  'MEDIUM'
);

console.log('\n');
console.log('='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log('\n');

const criticalCount = matches.filter(m => m.severity === 'CRITICAL').length;
const highCount = matches.filter(m => m.severity === 'HIGH').length;
const mediumCount = matches.filter(m => m.severity === 'MEDIUM').length;

console.log(`🔴 CRITICAL: ${criticalCount} matches`);
console.log(`🟡 HIGH:     ${highCount} matches`);
console.log(`🟢 MEDIUM:   ${mediumCount} matches`);
console.log(`📊 TOTAL:    ${matches.length} locations to review`);

console.log('\n');
console.log('='.repeat(80));
console.log('DETAILED RESULTS BY FILE');
console.log('='.repeat(80));
console.log('\n');

// Group by file
const byFile: { [file: string]: BugMatch[] } = {};
matches.forEach(m => {
  if (!byFile[m.file]) byFile[m.file] = [];
  byFile[m.file].push(m);
});

Object.keys(byFile).sort().forEach(file => {
  const critical = byFile[file].filter(m => m.severity === 'CRITICAL').length;
  const high = byFile[file].filter(m => m.severity === 'HIGH').length;
  const medium = byFile[file].filter(m => m.severity === 'MEDIUM').length;
  
  const badge = critical > 0 ? '🔴' : high > 0 ? '🟡' : '🟢';
  
  console.log(`${badge} ${file}`);
  console.log(`   Issues: ${critical} critical, ${high} high, ${medium} medium`);
  
  byFile[file].forEach(match => {
    const emoji = match.severity === 'CRITICAL' ? '🔴' : match.severity === 'HIGH' ? '🟡' : '🟢';
    console.log(`   ${emoji} Line ${match.line}: ${match.bug}`);
    console.log(`      ${match.content}`);
  });
  console.log('');
});

console.log('\n');
console.log('='.repeat(80));
console.log('NEXT STEPS');
console.log('='.repeat(80));
console.log('\n');

console.log('1. Review each 🔴 CRITICAL file immediately');
console.log('2. Fix expenses.category → JOIN to categories table');
console.log('3. Fix settings table → use users table');
console.log('4. Fix budget month queries → use month/year integers');
console.log('5. Add goal completion validation');
console.log('6. Test each fix before moving to next');
console.log('\n');

// Write results to file
const report = {
  timestamp: new Date().toISOString(),
  summary: {
    critical: criticalCount,
    high: highCount,
    medium: mediumCount,
    total: matches.length
  },
  matches: matches,
  byFile: byFile
};

fs.writeFileSync(
  path.join(process.cwd(), 'bug-locations-report.json'),
  JSON.stringify(report, null, 2)
);

console.log('📄 Full report saved to: bug-locations-report.json');
console.log('\n');
