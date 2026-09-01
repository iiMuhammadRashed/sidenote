import * as path from 'path';
import * as fs from 'fs';
import Mocha from 'mocha';

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'bdd',
    color: true,
    timeout: 10000,
  });

  const suiteDir = path.resolve(__dirname);
  const files = fs.readdirSync(suiteDir);

  for (const f of files) {
    if (f.endsWith('.test.js')) {
      mocha.addFile(path.resolve(suiteDir, f));
    }
  }

  return new Promise<void>((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

