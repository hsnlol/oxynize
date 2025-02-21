import { Buffer } from 'buffer';

// Polyfills for Node.js built-ins
declare global {
  interface Window {
    global: any;
    Buffer: typeof Buffer;
    process: any;
  }
}

window.global = window;
window.Buffer = Buffer;
window.process = {
  env: { NODE_DEBUG: undefined, NODE_ENV: process.env.NODE_ENV },
  version: '',
  versions: {},
  platform: '',
  nextTick: (cb: Function) => Promise.resolve().then(cb)
};