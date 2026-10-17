const { spawn } = require('child_process');
const electron = require('electron');

const args = process.argv.slice(2);
if (args.length === 0) {
  args.push('--test', 'tests/calcstore.test.js');
}

const child = spawn(electron, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code || 0);
  }
});
