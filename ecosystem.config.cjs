/** @type {import('pm2').StartOptions[]} */
module.exports = {
  apps: [
    {
      name: 'd4sign-api',
      cwd: '.',
      script: 'src/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3003,
      },
      error_file: '/var/log/pm2/d4sign-api-error.log',
      out_file: '/var/log/pm2/d4sign-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
