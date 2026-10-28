'use strict';

const crypto = require('node:crypto');
const ID = /^HP-[0-9]{3,6}$/;
const HEX = /^[0-9A-F]{32}$/;
const REQUEST_MS = 45000;
const WINDOW_MS = 600000;
function message(r) {
  return [r.recovery === true ? 'HPSETUP2' : 'HPSETUP1', r.deviceId, r.boot, r.requestId, r.password, r.deadline,
    ...(r.recovery === true ? ['RECOVERY'] : [])].join('|');
}
function signature(r, secret) {
  return crypto.createHmac('sha256', secret).update(message(r)).digest('hex').toUpperCase();
}
// This channel never calls queueCommand, modifies motor state, or clears WiFi.
function createSetupAccess({getState, now = Date.now, random = () =>
  crypto.randomBytes(16).toString('hex').toUpperCase()}) {
  const boards = new Map();
  const sessions = new Map();
  function prune() {
    for (const [id, s] of sessions) if (s.expires <= now()) sessions.delete(id);
    for (const [id, b] of boards) if (b.seen + WINDOW_MS <= now()) boards.delete(id);
  }
  function privateResponse(res) {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
  }
  function admin(req, res) {
    privateResponse(res);
    return req.user?.id && req.deviceMembership?.user_id === req.user.id &&
      req.deviceMembership?.device_id === req.params.deviceId &&
      req.deviceMembership?.role === 'admin';
  }
  function idle(id) {
    const s = getState(id);
    return s?.online === true && Number.isFinite(s.lastSeen) &&
      now() - s.lastSeen >= 0 && now() - s.lastSeen < 15000 &&
      String(s.state).toUpperCase() === 'IDLE' && s.commandPending === false &&
      s.motor === 'STOP' && s.status === 'idle';
  }
  function open(req, res) {
    prune();
    if (!admin(req, res)) return res.status(403).json({success:false, error:'Device administrator required'});
    const id = req.params.deviceId;
    if (!ID.test(id)) return res.status(400).json({success:false, error:'Invalid device ID'});
    const b = boards.get(id);
    if (!b || now() - b.seen >= 10000) return res.status(409).json({success:false, error:'Phone setup firmware is not available on this pole'});
    if (!idle(id)) return res.status(409).json({success:false, error:'Pole must be online and idle with no pending command'});
    if (sessions.has(id)) {
      const existing = sessions.get(id);
      return res.status(409).json({
        success:false,
        error:'A setup request already exists; wait for it to expire',
        setupState:existing.result,
        remainingMs:Math.max(0, Math.min(600000, existing.expires - now()))
      });
    }
    if (sessions.size >= 1000) return res.status(503).json({success:false, error:'Setup capacity reached'});
    const s = {deviceId:id, boot:b.boot, requestId:random(), password:random(),
      deadline:(b.clock + REQUEST_MS) >>> 0, owner:req.user.id,
      created:now(), expires:now()+REQUEST_MS, result:'PENDING', recovery:b.recovery === true};
    sessions.set(id, s);
    return res.status(202).json({success:true, deviceId:id, requestId:s.requestId});
  }
  function status(req, res) {
    prune();
    if (!admin(req, res)) return res.status(403).json({success:false, error:'Device administrator required'});
    const s = sessions.get(req.params.deviceId);
    if (!s || s.owner !== req.user.id || s.requestId !== req.params.requestId)
      return res.status(404).json({success:false, error:'Setup request not found or expired'});
    const result = {success:true, deviceId:s.deviceId, requestId:s.requestId, result:s.result};
    // Reveal only after the board acknowledges that its protected AP is running.
    if (s.result === 'OPEN') Object.assign(result, {ssid:`HonorPole-Setup-${s.deviceId}`,
      password:s.password, remainingMs:Math.max(0,s.expires-now()),
      ...(s.recovery && HEX.test(s.recoveryPassword || '') ? {recoveryPassword:s.recoveryPassword} : {})});
    return res.json(result);
  }
  function poll(req, res) {
    prune(); privateResponse(res);
    const id = req.deviceId;
    const boot = req.query.boot;
    const rawClock = req.query.clock;
    const secret = req.headers['x-device-secret'];
    if (!ID.test(id || '') || (typeof boot !== 'string' || !HEX.test(boot)) ||
      typeof rawClock !== 'string' || !/^\d{1,10}$/.test(rawClock) ||
      Number(rawClock) > 0xffffffff || typeof secret !== 'string' || !/^[0-9A-F]{64}$/.test(secret.trim()))
      return res.status(400).json({success:false, error:'Invalid setup poll'});
    if (!boards.has(id) && boards.size >= 1000) return res.status(503).json({success:false});
    const previous = boards.get(id);
    if (previous && previous.boot !== boot) sessions.delete(id);
    boards.set(id, {boot, clock:Number(rawClock), seen:now(), recovery:req.query.recovery === '1'});
    const s = sessions.get(id);
    if (!s || s.boot !== boot || s.result !== 'PENDING' || !idle(id))
      return res.json({success:true, setup:null});
    const packet = {deviceId:id, boot:s.boot, requestId:s.requestId,
      password:s.password, deadline:s.deadline, ...(s.recovery ? {recovery:true} : {})};
    packet.signature = signature(packet, secret.trim());
    return res.json({success:true, setup:packet});
  }
  function acknowledge(req, res) {
    prune(); privateResponse(res);
    const id = req.deviceId;
    const data = req.body || {};
    const s = sessions.get(id);
    if (!s || s.boot !== data.boot || s.requestId !== data.requestId ||
      !['OPEN','REFUSED'].includes(data.result)) return res.status(409).json({success:false});
    if (s.result === 'PENDING') {
      // Recovery material is accepted only for an explicitly signed v2 request.
      if (s.recovery && data.result === 'OPEN' && !HEX.test(data.recoveryPassword || ''))
        return res.status(400).json({success:false, error:'Recovery credential missing or invalid'});
      if (s.recovery && data.result === 'OPEN') s.recoveryPassword = data.recoveryPassword;
      s.result = data.result;
      // Conservatively account for request/delivery delay; retries never extend.
      s.expires = s.result === 'OPEN' ? s.created + WINDOW_MS : now() + 15000;
      if (s.result !== 'OPEN') s.password = '';
    }
    return res.json({success:true});
  }
  return {open,status,poll,acknowledge};
}
module.exports = {createSetupAccess, message, signature};
