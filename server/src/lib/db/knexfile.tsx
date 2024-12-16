import { Knex } from 'knex';
import { setTypeParser } from 'pg-types';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

type Function = (err: Error | null, connection: Knex.Client) => void;

// Load test environment variables if we're in a test environment
if (process.env.NODE_ENV === 'test') {
  const result = dotenv.config({
    path: '.env.localtest'
  });
  console.log(result);
  if (result.parsed?.DB_NAME_SERVER) {
    process.env.DB_NAME_SERVER = result.parsed.DB_NAME_SERVER;
  }
}

setTypeParser(20, parseFloat);
setTypeParser(1114, str => new Date(str + 'Z'));

const getPassword = (secretPath: string, envVar: string): string => {
  try {
    // Get the absolute path to the project root, handling both development and production paths
    let projectRoot = process.cwd(); // This will be the project root in both dev and prod
    
    // If we're in the server directory (development), go up one level
    if (projectRoot.endsWith('server')) {
      projectRoot = path.resolve(projectRoot, '..');
    }
    
    const fullPath = path.join(projectRoot, secretPath);
    console.log(`Attempting to read secret from: ${fullPath}`);
    
    if (!fs.existsSync(fullPath)) {
      console.warn(`Secret file not found at path: ${fullPath}`);
      if (process.env[envVar]) {
        console.warn(`Using ${envVar} environment variable instead of Docker secret`);
        return process.env[envVar] || '';
      }
      console.warn(`Neither secret file ${fullPath} nor ${envVar} environment variable found`);
      return '';
    }

    const content = fs.readFileSync(fullPath, 'utf8').trim();
    if (!content) {
      console.warn(`Secret file ${fullPath} is empty`);
      return '';
    }

    console.log(`Successfully read secret from: ${fullPath}`);
    return content;
  } catch (error) {
    console.error(`Error reading secret file: ${error}`);
    if (process.env[envVar]) {
      console.warn(`Using ${envVar} environment variable instead of Docker secret`);
      return process.env[envVar] || '';
    }
    console.warn(`Neither secret file ${secretPath} nor ${envVar} environment variable found`);
    return '';
  }
};

const getDbPassword = () => getPassword('secrets/db_password_server', 'DB_PASSWORD_SERVER');
const getPostgresPassword = () => getPassword('secrets/postgres_password', 'POSTGRES_PASSWORD');

// Special connection config for postgres user (needed for job scheduler)
export const postgresConnection = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER_ADMIN || 'postgres',
  password: process.env.DB_PASSWORD_ADMIN || getPostgresPassword(),
  database: process.env.DB_NAME_SERVER || 'server'
} satisfies Knex.PgConnectionConfig;

interface CustomKnexConfig extends Knex.Config {
  connection: Knex.PgConnectionConfig;
  pool?: {
    min?: number;
    max?: number;
    idleTimeoutMillis?: number;
    reapIntervalMillis?: number;
    createTimeoutMillis?: number;
    destroyTimeoutMillis?: number;
  };
  afterCreate?: (conn: any, done: Function) => void;
  afterRelease?: (conn: any, done: Function) => void;
}

const knexfile: Record<string, CustomKnexConfig> = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      user: 'app_user',
      password: process.env.DB_PASSWORD_SERVER || getDbPassword(),
      database: process.env.DB_NAME_SERVER || 'server'
    },
    pool: {
      min: 0,
      max: 20,
      idleTimeoutMillis: 1000,
      reapIntervalMillis: 1000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000
    }
  },
  production: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      user: 'app_user',
      password: process.env.DB_PASSWORD_SERVER || getDbPassword(),
      database: process.env.DB_NAME_SERVER || 'server'
    },
    pool: {
      min: 0,
      max: 20,
      idleTimeoutMillis: 1000,
      reapIntervalMillis: 1000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000
    }
  },
  local: {
    client: 'postgresql',
    connection: {
      host: 'localhost',
      port: 5432,
      user: process.env.DB_USER_ADMIN || 'postgres',
      password: process.env.DB_PASSWORD_ADMIN || getPostgresPassword(),
      database: process.env.DB_NAME_SERVER || 'server'
    },
    pool: {
      min: 0,
      max: 20,
      idleTimeoutMillis: 1000,
      reapIntervalMillis: 1000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000
    }
  }
};

export const getKnexConfigWithTenant = (tenant: string): CustomKnexConfig => {
  const env = process.env.APP_ENV || 'development';
  const config = { ...knexfile[env] };
  
  return {
    ...config,
    asyncStackTraces: true,
    wrapIdentifier: (value: string, origImpl: (value: string) => string) => {
      return origImpl(value);
    },
    postProcessResponse: (result: Record<string, unknown>[] | unknown) => {
      return result;
    },
    acquireConnectionTimeout: 60000,
    afterCreate: (conn: any, done: Function) => {
      conn.on('error', (err: Error) => {
        console.error('Database connection error:', err);
      });
      conn.query(`SET app.current_tenant = '${tenant}'`, (err: Error) => {
        done(err, conn);
      });
    },
    afterRelease: (conn: any, done: Function) => {
      conn.query('SELECT 1', (err: Error) => {
        if (err) {
          done(err, conn);
        } else {
          done(null, conn);
        }
      });
    }
  };
};

export default knexfile;
