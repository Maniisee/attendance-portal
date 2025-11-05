const { Pool } = require('pg');

// Railway database connection with fallback
function createDatabasePool() {
    // Try Railway's automatic database URL first
    if (process.env.DATABASE_URL) {
        console.log('🔗 Using DATABASE_URL for connection');
        return new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: {
                rejectUnauthorized: false
            }
        });
    }
    
    // Fallback to environment variables
    const config = {
        user: process.env.PGUSER || process.env.DB_USER || 'postgres',
        password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
        host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
        port: process.env.PGPORT || process.env.DB_PORT || 5432,
        database: process.env.PGDATABASE || process.env.DB_NAME || 'railway',
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    };
    
    console.log('🔗 Using individual env vars for connection');
    console.log('Host:', config.host);
    console.log('Database:', config.database);
    
    return new Pool(config);
}

module.exports = { createDatabasePool };