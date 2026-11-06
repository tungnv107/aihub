export const VERSION='0.5.0';
export const PRODUCT='ch-relay';
export const DEFAULT_PORT=18456;
// build-npm.mjs can pin the operator's HTTPS endpoint into the customer package.
export const PINNED_SERVER=typeof __CH_RELAY_SERVER__==='string'?__CH_RELAY_SERVER__:'';
