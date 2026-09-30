// Build flavours. The embedded web demo (npm run build:demo) runs inside a
// sandboxed frame where service workers and file downloads are unavailable.
export const IS_DEMO = import.meta.env.VITE_DEMO === '1';
