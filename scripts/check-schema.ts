/**
 * Check actual database schema structure
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
};

async function main() {
  console.log('Connecting to database...');
  const conn = await mysql.createConnection(DB_CONFIG);
  console.log('✅ Connected\n');

  try {
    // Get all tables
    const [tables] = await conn.execute<any[]>('SHOW TABLES');
    console.log('📋 TABLES:', tables.length);
    tables.forEach(t => console.log(' -', Object.values(t)[0]));
    console.log('\n');

    // Check critical tables
    const criticalTables = ['users', 'expenses', 'budgets', 'goals', 'categories'];

    for (const table of criticalTables) {
      console.log('='.repeat(80));
      console.log(`TABLE: ${table}`);
      console.log('='.repeat(80));
      
      const [columns] = await conn.execute<any[]>(`DESCRIBE ${table}`);
      console.table(columns.map((c: any) => ({
        Field: c.Field,
        Type: c.Type,
        Null: c.Null,
        Key: c.Key,
        Default: c.Default,
      })));
      console.log('\n');

      // Sample data
      const [rows] = await conn.execute<any[]>(`SELECT * FROM ${table} LIMIT 2`);
      if (rows.length > 0) {
        console.log('Sample Data:');
        console.table(rows);
      } else {
        console.log('(No data)');
      }
      console.log('\n');
    }

  } finally {
    await conn.end();
  }
}

main().catch(console.error);
