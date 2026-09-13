/**
 * AES primitives from @noble/ciphers, exposed unchanged by both hosts.
 * Inputs are Uint8Array; keys and nonce/IV sizes follow the selected primitive.
 * Includes gcm, ctr, ecb, cbc, cfb, gcmsiv, aeskw, aeskwp, cmac and aessiv.
 */
export * from '../lib/aes';
