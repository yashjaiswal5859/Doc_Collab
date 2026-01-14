require('dotenv').config();

const dbUser = process.env.DB_USER?.replace(/^["']|["']$/g, '');
const dbPassword = process.env.DB_PASSWORD?.replace(/^["']|["']$/g, '');
const dbHost = process.env.DB_HOST?.replace(/^["']|["']$/g, '');
const dbPort = process.env.DB_PORT?.replace(/^["']|["']$/g, '');
const dbName = process.env.DB_NAME?.replace(/^["']|["']$/g, '');

module.exports = {
  development: {
    username: dbUser,
    password: dbPassword,
    database: dbName,
    host: dbHost,
    port: dbPort,
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    pool: {
      max: 1,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },
  production: {
    username: dbUser,
    password: dbPassword,
    database: dbName,
    host: dbHost,
    port: dbPort,
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    pool: {
      max: 1,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
};
