const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { connectDB, disconnectDB } = require('./config/db');
const { seedDatabase } = require('./utils/seedData');

const run = async () => {
  await connectDB();
  await seedDatabase();
  await disconnectDB();
  process.exit(0);
};

run().catch((err) => {
  console.error('Seed execution failed:', err);
  process.exit(1);
});
