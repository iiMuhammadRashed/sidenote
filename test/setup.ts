import * as Module from 'module';
import * as mockVscode from './mocks/vscode';

// Intercept require('vscode')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const originalRequire = (Module.prototype as any).require;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Module.prototype as any).require = function (request: string, ...args: unknown[]) {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, [request, ...args]);
};
