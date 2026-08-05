import { parseConfig } from './config.js';
import { closeDb,createDb } from './db.js';
import { AdminService } from './services/adminService.js';

const config = parseConfig();
if (!config.adminBootstrapUsername || !config.adminBootstrapPassword) {
  throw new Error('Set ADMIN_BOOTSTRAP_USERNAME and ADMIN_BOOTSTRAP_PASSWORD for bootstrap');
}
const db = createDb(config);
try {
  const service = new AdminService(db, config);
  const result = await service.bootstrap(config.adminBootstrapUsername, config.adminBootstrapPassword);
  console.log(JSON.stringify({ created: result.created }));
} finally {
  await closeDb(db);
}
