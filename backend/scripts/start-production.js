import { runMigrations } from './migrate-realm.js';
import { startNexus } from '../src/nexus.js';

try {
  await runMigrations();
  await startNexus();
} catch (error) {
  console.error('Production startup failed:', error);
  process.exitCode = 1;
}
