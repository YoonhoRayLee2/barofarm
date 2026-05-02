/**
 * Native Bridge Wrapper — Barofarm
 * Wraps the Flutter JavascriptChannel `window.NativeBridge` (postMessage-only)
 * with a callId+Promise dispatcher matching app/lib/native_bridge.dart.
 *
 * Browser fallbacks let pages run in a normal browser during development.
 *
 * @module native-bridge
 */

const _channel = (typeof window !== 'undefined') ? window.NativeBridge : undefined;
const hasNative = !!(_channel && typeof _channel.postMessage === 'function');

const _pending = new Map();
let _seq = 0;

function _newCallId() {
  _seq += 1;
  return `c${Date.now()}_${_seq}`;
}

function _call(method, args = {}) {
  if (!hasNative) {
    return Promise.reject(new Error('NativeBridge unavailable'));
  }
  return new Promise((resolve, reject) => {
    const callId = _newCallId();
    _pending.set(callId, { resolve, reject });
    try {
      _channel.postMessage(JSON.stringify({ method, callId, args }));
    } catch (e) {
      _pending.delete(callId);
      reject(e);
    }
  });
}

function _settle(callId, payload, isResolve) {
  const entry = _pending.get(callId);
  if (!entry) return;
  _pending.delete(callId);
  if (isResolve) {
    if (payload && payload.ok === false) entry.reject(new Error(payload.error || 'native error'));
    else entry.resolve(payload);
  } else {
    entry.reject(new Error((payload && payload.error) || 'native error'));
  }
}

if (hasNative) {
  // Replace channel reference with wrapper exposing both postMessage and _resolve/_reject.
  // Flutter invokes window.NativeBridge._resolve(callId, json) / ._reject(callId, json).
  window.NativeBridge = {
    postMessage: (msg) => _channel.postMessage(msg),
    _resolve: (callId, payload) => _settle(callId, payload, true),
    _reject: (callId, payload) => _settle(callId, payload, false),
  };
}

export function isNativeShell() {
  return hasNative;
}

export async function getFcmToken() {
  if (!hasNative) return null;
  const res = await _call('getFcmToken');
  return res?.value ?? null;
}

export async function requestCameraPermission() {
  if (!hasNative) return 'web-fallback';
  const res = await _call('requestCameraPermission');
  return res?.granted ? 'granted' : (res?.status || 'denied');
}

export async function requestMicPermission() {
  if (!hasNative) return 'web-fallback';
  const res = await _call('requestMicPermission');
  return res?.granted ? 'granted' : (res?.status || 'denied');
}

export async function setSecureItem(key, value) {
  if (!hasNative) {
    localStorage.setItem(key, value);
    return;
  }
  await _call('setSecureItem', { key, value });
}

export async function getSecureItem(key) {
  if (!hasNative) return localStorage.getItem(key);
  const res = await _call('getSecureItem', { key });
  return res?.value ?? null;
}

export async function openExternal(url) {
  if (!hasNative) {
    window.open(url, '_blank');
    return;
  }
  await _call('openExternal', { url });
}

/* -------------- Native -> Web Callbacks -------------- */
window.onPush = window.onPush || function () {};
window.onAppResume = window.onAppResume || function () {};
