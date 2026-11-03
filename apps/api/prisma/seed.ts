import { createDb } from '../src/db/client.ts';
import { seedSyntheticData } from '../src/db/seed.ts';

// `prisma db seed` entry point. Synthetic data only; refuses to run in production.
const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!url) {
  console.error('Set DATABASE_URL or DIRECT_URL to seed a development database.');
  process.exit(1);
}
const db = createDb(url);
try {
  await seedSyntheticData(db, process.env.NODE_ENV);
  process.stdout.write('Seeded synthetic development data.\n');
} finally {
  await db.$disconnect();
}
