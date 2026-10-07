import { pgDb } from './db';
import { migrate } from './migrate';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL');
const db = pgDb(url);
console.log('Applied:', (await migrate(db)).join(', ') || 'nothing new');
await db.close();
