// Public RPC endpoints
export const PRIMARY_RPC_URL = 'https://api.mainnet-beta.solana.com';
export const BACKUP_RPC_URL = 'https://solana-mainnet.g.alchemy.com/v2/demo';
export const FALLBACK_RPC_URL = 'https://rpc.ankr.com/solana';

// Websocket endpoints
export const PRIMARY_WS_URL = 'wss://api.mainnet-beta.solana.com';

// Configuration
export const RPC_CONFIG = {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: 60000,
  wsEndpoint: PRIMARY_WS_URL
};