const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const connectionString = process.env.DATABASE_URL;

// Configure resilient connection pool tuned for Neon PostgreSQL serverless compute
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000, // 30s allowance for Neon compute cold-start/wake-up
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

// Gracefully handle idle connection terminations by Neon's PgBouncer pooler
pool.on('error', (err) => {
  console.warn('[Database Pool] Idle client socket closed by server:', err.message);
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({
  adapter,
  log: ['warn', 'error']
});

const connectDB = async (retries = 3, delay = 2000) => {
  for (let i = 1; i <= retries; i++) {
    try {
      await prisma.$connect();
      console.log('[Database] PostgreSQL connected via Prisma (@prisma/adapter-pg)');
      return prisma;
    } catch (error) {
      console.warn(`[Database] Connection attempt ${i}/${retries} failed: ${error.message}`);
      if (i === retries) {
        console.error('[Database] All connection attempts failed.');
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

const disconnectDB = async () => {
  try {
    await prisma.$disconnect();
    await pool.end();
  } catch (err) {
    console.error('[Database] Disconnect error:', err.message);
  }
};

module.exports = { prisma, connectDB, disconnectDB };
