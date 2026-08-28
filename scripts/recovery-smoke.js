require('../lib/result-recovery-patch');

const express = require('express');

async function main() {
  const app = express();
  const server = app.listen(0, '127.0.0.1', async () => {
    try {
      const address = server.address();
      const token = 'a'.repeat(32);
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/recover-result?token=${token}`
      );
      const data = await response.json();
      if (response.status !== 202 || data.pending !== true) {
        throw new Error(`Recovery smoke invalide: status=${response.status}`);
      }
      console.log('Recovery smoke OK');
      server.close(() => process.exit(0));
    } catch (error) {
      console.error(error);
      server.close(() => process.exit(1));
    }
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
