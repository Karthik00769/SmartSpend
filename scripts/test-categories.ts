import { query } from '../lib/db';

async function main() {
  const rows = await query('SELECT * FROM categories');
  console.log('categories', rows);
  process.exit(0);
}
main();
