'use strict';

// Wire primitives only. This module has no HTTP routes or ownership authority.
const crypto = require('node:crypto');
const MAX = Number.MAX_SAFE_INTEGER;
const TTL = 45000;
const hex = (s, n) => typeof s === 'string' && s.length === n && /^[0-9A-F]+$/.test(s);
const uint = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max;
const id = s => typeof s === 'string' && s.length >= 6 && s.length <= 9 && s.startsWith('HP-') &&
  [...s.slice(3)].every(c => c >= '0' && c <= '9') && Number(s.slice(3)) > 0;
const request = s => typeof s === 'string' && s.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
function valid(p) {
  return p && id(p.deviceId) && hex(p.boot, 32) && hex(p.ticket, 32) && request(p.requestId) &&
    uint(p.generation, MAX) && uint(p.nextGeneration, MAX) && uint(p.deadline, 0xffffffff) &&
    ((p.action === 'HOLD' && p.nextGeneration === p.generation) ||
     (p.action === 'RELEASE' && p.generation < MAX && p.nextGeneration === p.generation + 1));
}
function message(p, acknowledgement = false) {
  if (!valid(p) || (acknowledgement && p.state !== (p.action === 'HOLD' ? 'QUIESCED' : 'RELEASED')))
    throw new TypeError('Invalid handover packet');
  return ['HPHANDOVER1', acknowledgement ? 'ACK' : 'DIRECTIVE', p.deviceId, p.boot,
    p.ticket, p.requestId, p.action, p.generation, p.nextGeneration, p.deadline,
    ...(acknowledgement ? [p.state] : [])].join('|');
}
function mac(text, secret) {
  // DeviceIdentity stores a 64-character uppercase key. Use its ASCII bytes,
  // matching the existing protected-setup protocol (not hex-decoded bytes).
  if (!hex(secret, 64)) throw new TypeError('Invalid factory key');
  return crypto.createHmac('sha256', secret).update(text, 'ascii').digest('hex').toUpperCase();
}
function signDirective(p, secret) {
  const text = message(p);
  // Copy only the authenticated fields. Never carry tokens/owner metadata.
  const {deviceId, boot, ticket, requestId, action, generation, nextGeneration, deadline} = p;
  return {deviceId, boot, ticket, requestId, action, generation, nextGeneration, deadline,
    signature: mac(text, secret)};
}
function verifyAcknowledgement(ack, issued, secret) {
  try {
    if (!valid(issued) || !hex(ack?.signature, 64)) return false;
    // The caller must supply its retained, durably issued directive; an ACK
    // must never be used to invent a pending request or advance ownership.
    for (const key of ['deviceId','boot','ticket','requestId','action','generation','nextGeneration','deadline'])
      if (ack[key] !== issued[key]) return false;
    const expected = mac(message(ack, true), secret);
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(ack.signature, 'hex'));
  } catch { return false; }
}
module.exports = {MAX, TTL, message, signDirective, verifyAcknowledgement};
