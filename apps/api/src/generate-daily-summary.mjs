import { pool, transaction } from './db.mjs';
import { generateAndStoreDailyOperationsSummary, previousHarareDateKey } from './operations-summary.mjs';

const requestedDate = process.argv[2] || previousHarareDateKey();

try {
  const { summary } = await transaction((client) => generateAndStoreDailyOperationsSummary(client, requestedDate));
  console.log(JSON.stringify({ level: 'info', message: 'Daily operations summary generated.', date: summary.date, generatedAt: summary.generatedAt }));
} finally {
  await pool.end();
}
