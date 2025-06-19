import { Pool } from 'pg';

const db = new Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

db.on('connect', () => {
  console.log('Conectado ao banco de dados NeonDB');
});

export default db;
