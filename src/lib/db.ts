import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.POSTGRES_URL!);

async function initializeDatabase() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS calls (
        id TEXT PRIMARY KEY,
        call_id TEXT UNIQUE NOT NULL,
        from_number TEXT,
        to_number TEXT,
        direction TEXT,
        result TEXT,
        user_extension TEXT,
        start_time TEXT,
        duration INTEGER,
        recording_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_start_time ON calls (start_time)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_user_extension ON calls (user_extension)`;
  } catch (error: any) {
    if (!error.message?.includes('already exists')) {
      console.error('Failed to initialize database:', error);
    }
  }
}

initializeDatabase().catch(console.error);

export const db = {
  prepare: (text: string) => ({
    run: async (values: any[] = []) => {
      try {
        return await sql.query(text, values);
      } catch (error) {
        console.error('[db.run] SQL Error:', error);
        throw error;
      }
    },
    all: async (values: any[] = []) => {
      try {
        const result = await sql.query(text, values);
        return Array.isArray(result) ? result : Array.from(result as Iterable<unknown>) || [];
      } catch (error) {
        console.error('[db.all] SQL Error:', error);
        throw error;
      }
    },
    get: async (values: any[] = []) => {
      try {
        const result = await sql.query(text, values);
        const rows = Array.isArray(result) ? result : Array.from(result as Iterable<unknown>);
        return rows[0] || null;
      } catch (error) {
        console.error('[db.get] SQL Error:', error);
        throw error;
      }
    },
  }),
};

export default db;