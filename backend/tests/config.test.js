const { spawnSync } = require('child_process');
const path = require('path');

const configPath = path.resolve(__dirname, '../src/config.js');

function loadConfig(env) {
  return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(configPath)})`], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

describe('config JWT secret safety check', () => {
  test('exits in production when JWT_SECRET is missing', () => {
    const result = loadConfig({ NODE_ENV: 'production', JWT_SECRET: '' });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/JWT_SECRET/);
  });

  test('exits in production when JWT_SECRET equals default', () => {
    const result = loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'dev-secret-change-me' });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/JWT_SECRET/);
  });

  test('loads in production when JWT_SECRET is set to a non-default value', () => {
    const result = loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'a-real-production-secret' });
    expect(result.status).toBe(0);
  });

  test('loads in development without JWT_SECRET', () => {
    const result = loadConfig({ NODE_ENV: 'development', JWT_SECRET: '' });
    expect(result.status).toBe(0);
  });
});
