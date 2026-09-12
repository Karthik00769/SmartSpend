/**
 * Data Migration: Fix Invalid Completed Goals
 * 
 * This script fixes goals that were incorrectly marked as "completed"
 * when saved_minor < target_minor.
 * 
 * Run with: npx tsx scripts/fix-invalid-completed-goals.ts
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'smartspend',
  timezone: '+00:00',
};

async function main() {
  console.log('='.repeat(80));
  console.log('DATA MIGRATION: Fix Invalid Completed Goals');
  console.log('='.repeat(80));
  console.log('\n');

  const conn = await mysql.createConnection(DB_CONFIG);

  try {
    // Find invalid goals
    console.log('Step 1: Finding invalid completed goals...\n');
    
    const [invalidGoals] = await conn.execute<any[]>(`
      SELECT 
        id,
        user_id,
        title,
        target_minor,
        saved_minor,
        status,
        ROUND((saved_minor / target_minor) * 100, 1) AS completion_pct
      FROM goals
      WHERE status = 'completed'
        AND saved_minor < target_minor
        AND deleted_at IS NULL
      ORDER BY id
    `);

    if (invalidGoals.length === 0) {
      console.log('✅ No invalid completed goals found. Database is clean.\n');
      return;
    }

    console.log(`Found ${invalidGoals.length} invalid goal(s):\n`);
    console.table(invalidGoals.map((g: any) => ({
      ID: g.id,
      Title: g.title.substring(0, 30),
      Target: g.target_minor,
      Saved: g.saved_minor,
      'Completion %': g.completion_pct,
      Status: g.status
    })));
    console.log('\n');

    // Fix the goals
    console.log('Step 2: Fixing goals (setting status to "active")...\n');
    
    const [result] = await conn.execute<any>(`
      UPDATE goals
      SET status = 'active',
          updated_at = NOW()
      WHERE status = 'completed'
        AND saved_minor < target_minor
        AND deleted_at IS NULL
    `);

    console.log(`✅ Fixed ${result.affectedRows} goal(s)\n`);
    
    // Log the specific IDs that were fixed
    const fixedIds = invalidGoals.map((g: any) => g.id);
    console.log('Fixed Goal IDs:', fixedIds.join(', '));
    console.log('\n');

    // Verify the fix
    console.log('Step 3: Verifying fix...\n');
    
    const [stillInvalid] = await conn.execute<any[]>(`
      SELECT COUNT(*) as count
      FROM goals
      WHERE status = 'completed'
        AND saved_minor < target_minor
        AND deleted_at IS NULL
    `);

    const invalidCount = stillInvalid[0]?.count || 0;
    
    if (invalidCount === 0) {
      console.log('✅ Verification passed: No invalid completed goals remain\n');
    } else {
      console.log(`⚠️  Warning: ${invalidCount} invalid goal(s) still exist\n`);
    }

    console.log('='.repeat(80));
    console.log('MIGRATION COMPLETE');
    console.log('='.repeat(80));
    console.log('\nSummary:');
    console.log(`  - Goals found: ${invalidGoals.length}`);
    console.log(`  - Goals fixed: ${result.affectedRows}`);
    console.log(`  - Status changed: completed → active`);
    console.log(`  - Remaining issues: ${invalidCount}`);
    console.log('\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
