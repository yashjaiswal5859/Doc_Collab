require('dotenv').config();
const { Sequelize } = require('sequelize');

// Option 1: Use DATABASE_URL directly (recommended, like auth-service)
if (process.env.DATABASE_URL) {
  console.log('Connecting to Supabase using DATABASE_URL...');
  
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: false,
    pool: {
      max: 1,  // Reduced for Supabase connection limits (like auth-service)
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  });
  
  module.exports = sequelize;
} else {
  // Option 2: Build from individual components
  const requiredEnvVars = ['DB_USER', 'DB_PASSWORD', 'DB_HOST', 'DB_PORT', 'DB_NAME'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars.join(', '));
    throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
  }
  
  // Remove quotes that might be included from .env file
  const dbUser = String(process.env.DB_USER).replace(/^["']|["']$/g, '');
  const dbPassword = String(process.env.DB_PASSWORD).replace(/^["']|["']$/g, '');
  const dbHost = String(process.env.DB_HOST).replace(/^["']|["']$/g, '');
  const dbPort = String(process.env.DB_PORT).replace(/^["']|["']$/g, '');
  const dbName = String(process.env.DB_NAME).replace(/^["']|["']$/g, '');
  
  const connectionString = `postgresql://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword)}@${dbHost}:${dbPort}/${dbName}`;
  
  console.log('Connecting to Supabase...');
  console.log('Host:', dbHost);
  console.log('User:', dbUser);
  console.log('Database:', dbName);
  
  const sequelize = new Sequelize(connectionString, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: false,
    pool: {
      max: 1,  // Reduced for Supabase connection limits (like auth-service)
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  });
  
  module.exports = sequelize;
}
