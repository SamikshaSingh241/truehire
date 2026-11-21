const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const connectDB = async () => {
  try {
    await prisma.$connect();
    console.log('[Database] PostgreSQL connected via Prisma (@prisma/adapter-pg)');
    return prisma;
  } catch (error) {
    console.error('[Database] Connection error:', error.message);
    process.exit(1);
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
