'use strict';
const crypto = require('node:crypto');

const DEVICE_PATTERN = /^HP-[0-9]{3,6}$/;
const SECRET_PATTERN = /^[0-9A-F]{64}$/;
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const safeEqual = (a, b) => typeof a === 'string' && typeof b === 'string' &&
    crypto.timingSafeEqual(Buffer.from(sha256(a), 'hex'), Buffer.from(sha256(b), 'hex'));

function createFactoryRegistry({supabaseUrl, serviceKey, anonKey, legacySecrets = {},
    enabled = false, factorySecret = '', legacyTelemetryIds = [],
    fetchImpl = globalThis.fetch, now = Date.now}) {
    const legacyIds = new Set(legacyTelemetryIds);
    if ([...legacyIds].some(id => !DEVICE_PATTERN.test(id))) {
        throw new Error('Invalid legacy telemetry device list');
    }
    const cache = new Map();
    const pending = new Map();
    async function rpc(name, body, token = serviceKey, apiKey = serviceKey) {
        if (!token || !apiKey) throw new Error('Registry credentials unavailable');
        const response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${name}`, {
            method: 'POST', headers: {Authorization: `Bearer ${token}`, apikey: apiKey,
                'Content-Type': 'application/json'},
            body: JSON.stringify(body), signal: AbortSignal.timeout(8000)
        });
        const data = await response.json();
        if (!response.ok) {
            const error = new Error('Registry request failed');
            error.code = data?.code;
            throw error;
        }
        return data;
    }
    async function lookup(deviceId) {
        const hit = cache.get(deviceId);
        if (hit && hit.expires > now()) return hit.value;
        if (pending.has(deviceId)) return pending.get(deviceId);
        if (pending.size >= 100) throw new Error('Registry lookup capacity reached');
        const request = (async () => {
            const rows = await rpc('honorpole_factory_lookup', {p_device_id: deviceId});
            if (!Array.isArray(rows) || rows.length > 1) throw new Error('Invalid registry response');
            const value = rows[0] || null;
            if (value && (value.device_id !== deviceId ||
                !/^[0-9a-f]{64}$/.test(value.secret_hash) || typeof value.enabled !== 'boolean')) {
                throw new Error('Invalid registry record');
            }
            if (cache.size >= 1000) cache.delete(cache.keys().next().value);
            cache.set(deviceId, {value, expires: now() + (value ? 10000 : 2000)});
            return value;
        })();
        pending.set(deviceId, request);
        try { return await request; } finally { pending.delete(deviceId); }
    }
    function providedSecret(req) {
        const raw = req.headers['x-device-secret'];
        return typeof raw === 'string' ? raw.trim() : '';
    }
    function requestDeviceId(req, telemetry) {
        const source = req.method === 'GET' ? req.query : req.body;
        const camel = source?.deviceId;
        const snake = source?.device_id;
        if ((camel !== undefined && typeof camel !== 'string') ||
            (snake !== undefined && typeof snake !== 'string')) return null;
        if (camel !== undefined && snake !== undefined && camel.trim() !== snake.trim()) return null;
        let id = (camel ?? snake ?? '').trim();
        if (!id && telemetry && legacyIds.has('HP-001')) id = 'HP-001';
        return DEVICE_PATTERN.test(id) ? id : null;
    }
    async function authenticate(req, res, next, telemetry) {
        if (telemetry && !enabled) return next();
        const id = requestDeviceId(req, telemetry);
        const supplied = providedSecret(req);
        if (!id) return res.status(400).json({success: false, error: 'Invalid or missing device ID'});
        if ((!supplied && !(telemetry && legacyIds.has(id))) || supplied.length > 256) {
            return res.status(401).json({success: false, error: 'Invalid device credentials'});
        }
        try {
            const record = enabled ? await lookup(id) : null;
            let accepted = false;
            if (record) {
                // An enrolled/revoked record never falls back to an old environment key.
                accepted = record.enabled && SECRET_PATTERN.test(supplied) &&
                    safeEqual(sha256(supplied), record.secret_hash);
            } else if (telemetry && legacyIds.has(id)) {
                // Explicit compatibility exception; only for an unenrolled original board.
                accepted = true;
            } else {
                accepted = supplied.length > 0 && safeEqual(supplied, legacySecrets[id]);
            }
            if (!accepted) return res.status(401).json({success: false, error: 'Invalid device credentials'});
            req.deviceId = id;
            return next();
        } catch {
            // Do not fall back if the credential service failed or returned malformed data.
            return res.status(503).json({success: false, error: 'Device authentication unavailable'});
        }
    }
    const requirePairingAuth = (req, res, next) => authenticate(req, res, next, false);
    const requireTelemetryAuth = (req, res, next) => authenticate(req, res, next, true);

    async function register(req, res) {
        if (!enabled) return res.status(503).json({success: false, error: 'Factory registration disabled'});
        const header = req.headers['x-honorpole-factory-secret'];
        if (!SECRET_PATTERN.test(factorySecret) || !safeEqual(header, factorySecret)) {
            return res.status(401).json({success: false, error: 'Factory authentication required'});
        }
        const {requestId, secret, pairingCode, deviceName} = req.body || {};
        if (typeof requestId !== 'string' || !UUID_PATTERN.test(requestId) ||
            typeof secret !== 'string' || !SECRET_PATTERN.test(secret) ||
            typeof pairingCode !== 'string' || !CODE_PATTERN.test(pairingCode) ||
            typeof deviceName !== 'string' || !deviceName.trim() || deviceName.length > 100) {
            return res.status(400).json({success: false, error: 'Invalid factory registration request'});
        }
        const secretHash = sha256(secret);
        const codeHash = sha256(pairingCode);
        const registrationHash = sha256(JSON.stringify([requestId.toLowerCase(), secretHash, codeHash, deviceName.trim()]));
        try {
            const data = await rpc('honorpole_factory_register', {
                p_request_id: requestId, p_secret_hash: secretHash,
                p_registration_hash: registrationHash, p_pairing_code_hash: codeHash,
                p_name: deviceName.trim()
            });
            if (!data || !DEVICE_PATTERN.test(data.deviceId) || typeof data.created !== 'boolean' ||
                typeof data.claimed !== 'boolean' || !Number.isFinite(Date.parse(data.expiresAt))) {
                throw new Error('Invalid registration result');
            }
            cache.delete(data.deviceId);
            return res.status(data.created ? 201 : 200).json({success: true,
                deviceId: data.deviceId, created: data.created,
                expiresAt: data.expiresAt, claimed: data.claimed});
        } catch (error) {
            const status = error.code === 'HP409' ? 409 : error.code === 'HP400' ? 400 : 503;
            return res.status(status).json({success: false,
                error: status === 409 ? 'Factory request conflict; preserve the existing stage' : 'Factory registration unavailable'});
        }
    }

    async function claim(req, res, legacyHandler) {
        if (!enabled) return legacyHandler(req, res);
        const pairingCode = typeof req.body?.pairingCode === 'string' ? req.body.pairingCode.trim().toUpperCase() : '';
        const id = typeof req.body?.deviceId === 'string' ? req.body.deviceId.trim().toUpperCase() : '';
        if (!CODE_PATTERN.test(pairingCode) || (id && !DEVICE_PATTERN.test(id)) ||
            (req.body?.deviceId !== undefined && typeof req.body.deviceId !== 'string')) {
            return res.status(400).json({success: false, error: 'Invalid pairing request'});
        }
        try {
            const data = await rpc('honorpole_claim_device', {
                p_pairing_code_hash: sha256(pairingCode), p_device_id: id || null
            }, req.accessToken, anonKey);
            if (!data || !DEVICE_PATTERN.test(data.deviceId) || (id && data.deviceId !== id)) {
                throw new Error('Invalid claim result');
            }
            const requestedName = typeof req.body?.deviceName === 'string' ? req.body.deviceName.trim() : '';
            return res.status(200).json({success: true, verified: true, deviceId: data.deviceId,
                deviceName: requestedName || data.deviceName || 'HonorPole'});
        } catch (error) {
            const statuses = {HP400:400, HP401:401, HP404:404, HP409:409, HP410:410};
            const status = statuses[error.code] || 503;
            return res.status(status).json({success: false, error: {
                400:'Invalid pairing request',401:'Authentication required',404:'Invalid pairing code',
                409:'Pairing code already used',410:'Pairing code expired',503:'Device pairing unavailable'
            }[status]});
        }
    }
    return {requirePairingAuth, requireTelemetryAuth, register, claim};
}
module.exports = {createFactoryRegistry};
