import { realmConnector } from '../src/repositories/realm-connector.js';
import { administrationRepository } from '../src/repositories/administration-repository.js';
import { InputValidator } from '../src/validators/input-validator.js';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('Usage: npm run admin -- --user <verified-email> --grant|--revoke\nRequires an explicit REALM_CONNECTION. Changes are audited; no default admin is created.');
} else {
  if (args.length !== 3 || args[0] !== '--user' || !['--grant', '--revoke'].includes(args[2])
    || !InputValidator.validateEmail(args[1]).valid) throw new Error('Use --help for the admin role command');
  if (!process.env.REALM_CONNECTION) throw new Error('Admin role changes require an explicit REALM_CONNECTION');
  await realmConnector.establish();
  try {
    console.log(JSON.stringify(await administrationRepository.changeRole(args[1], args[2] === '--grant' ? 'admin' : 'member')));
  } finally { await realmConnector.disconnect(); }
}
