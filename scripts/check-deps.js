#!/usr/bin/env node

/**
 * Friendly dependency checker so `npm start` / `npm run dev` fail with
 * actionable guidance instead of a long module stack trace.
 */
const required = ['express', 'multer', 'cors', 'pdfkit', 'qrcode', 'uuid'];

const missing = required.filter((pkg) => {
  try {
    require.resolve(pkg);
    return false;
  } catch {
    return true;
  }
});

if (missing.length > 0) {
  console.error('\nMissing npm dependencies detected:');
  missing.forEach((name) => console.error(`- ${name}`));
  console.error('\nRun the following command from the project root first:');
  console.error('  npm install\n');
  process.exit(1);
}

console.log('All runtime dependencies are installed.');
