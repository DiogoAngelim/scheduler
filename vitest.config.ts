import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/server.ts',
        'src/repositories/interfaces.ts',
        'src/repositories/postgresRepositories.ts',
        'src/db/client.ts'
      ]
    }
  }
});