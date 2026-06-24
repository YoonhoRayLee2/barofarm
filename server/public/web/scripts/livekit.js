/**
 * livekit.js — SPA LiveKit 헬퍼 모듈
 *
 * 전제: index.html 에서 CDN UMD 빌드를 먼저 로드해 window.LivekitClient 전역이
 * 존재해야 한다.
 *   <script src="https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.umd.min.js"></script>
 *
 * 사용처: server/public/web/pages/live-seller.js, live-buyer.js
 */

/** @returns {typeof import('livekit-client')} */
function getLK() {
  if (!window.LivekitClient) {
    throw new Error('[livekit.js] window.LivekitClient 가 정의되지 않았습니다. index.html 에 CDN script 태그가 있는지 확인하세요.');
  }
  return window.LivekitClient;
}

/**
 * LiveKit 룸에 연결하고 Room 인스턴스를 반환한다.
 *
 * @param {{ url: string, token: string }} opts
 * @param {object} [roomOptions] - LivekitClient.RoomOptions 오버라이드
 * @returns {Promise<import('livekit-client').Room>}
 */
export async function connectRoom({ url, token }, roomOptions = {}) {
  const LK = getLK();

  if (!url || !token) {
    throw new Error(`[livekit] connectRoom: url 또는 token 누락 (url=${!!url}, token=${!!token}) — 서버 응답 필드명 확인`);
  }

  console.log('[livekit] connecting', {
    urlPrefix: String(url).slice(0, 30),
    tokenPrefix: String(token).slice(0, 20),
  });

  const room = new LK.Room({
    adaptiveStream: true,
    dynacast: true,
    ...roomOptions,
  });

  await room.connect(url, token);
  console.log('[livekit] connected, roomName=', room.name);
  return room;
}

/**
 * 카메라·마이크 트랙을 생성하여 룸에 publish 한다 (셀러 전용).
 * 후면 카메라(environment) + 720p + 에코 제거 마이크.
 *
 * @param {import('livekit-client').Room} room
 * @returns {Promise<{ cameraTrack: import('livekit-client').LocalVideoTrack, micTrack: import('livekit-client').LocalAudioTrack }>}
 */
export async function publishCamera(room) {
  const LK = getLK();

  // 1차: 후면 카메라 강제 (exact). 에뮬레이터·데스크톱처럼 후면이 없으면 OverconstrainedError.
  // 2차: ideal 힌트로 재시도 → 후면 우선, 없으면 가용 카메라(전면 등)로 폴백.
  let cameraTrack;
  try {
    cameraTrack = await LK.createLocalVideoTrack({
      facingMode: { exact: 'environment' },
      resolution: LK.VideoPresets.h720.resolution,
    });
    console.log('[livekit] camera: back (environment)');
  } catch (err) {
    console.warn('[livekit] back camera unavailable, falling back:', err?.name || err?.message);
    try {
      cameraTrack = await LK.createLocalVideoTrack({
        facingMode: { ideal: 'environment' },
        resolution: LK.VideoPresets.h720.resolution,
      });
      console.log('[livekit] camera: fallback (default)');
    } catch (err2) {
      console.error('[livekit] camera: all attempts failed', err2?.name || err2?.message);
      const e = new Error('[livekit] 카메라를 사용할 수 없습니다: ' + (err2?.message || err2));
      e.cameraFailed = true;
      throw e;
    }
  }

  const micTrack = await LK.createLocalAudioTrack({
    echoCancellation: false,   // 음악 송출 시 색조 왜곡 방지
    noiseSuppression: false,   // 배경음/음악을 잡음으로 오인해 깎는 문제 방지
    autoGainControl: false,    // AGC가 음악 다이나믹스를 손상시키는 문제 방지
  });

  await room.localParticipant.publishTrack(cameraTrack, {
    simulcast: true,
    videoSimulcastLayers: [LK.VideoPresets.h540, LK.VideoPresets.h216],
  });

  const musicPreset = LK.AudioPresets?.musicHighQuality;
  if (musicPreset) {
    await room.localParticipant.publishTrack(micTrack, {
      audioPreset: musicPreset,
      dtx: false,  // 무음 구간에도 스트림 유지 (음악·배경음 끊김 방지)
      red: true,   // 패킷 손실 복원 (음질 보호)
    });
  } else {
    console.warn('[livekit] AudioPresets.musicHighQuality 없음 — 기본 오디오 설정으로 발행');
    await room.localParticipant.publishTrack(micTrack);
  }

  _cameraTrack = cameraTrack;
  console.log('[livekit] published camera + mic');
  return { cameraTrack, micTrack };
}

/** @type {import('livekit-client').LocalVideoTrack | null} */
let _cameraTrack = null;

/** @type {number} */
let _currentZoom = 1;

/**
 * 현재 publish 중인 cameraTrack을 반환한다 (captureFrame 에서 사용).
 * @returns {import('livekit-client').LocalVideoTrack | null}
 */
export function getCameraTrack() {
  return _cameraTrack;
}

/**
 * 현재 publish 중인 cameraTrack의 MediaStreamTrack으로부터 JPEG Blob을 캡처한다.
 *
 * 1차: ImageCapture API (지원 시)
 * 2차: <video> + <canvas> fallback
 *
 * @returns {Promise<Blob>} JPEG Blob
 * @throws {Error} cameraTrack 없거나 캡처 실패 시
 */
export async function captureFrame() {
  if (!_cameraTrack) {
    throw new Error('[livekit] captureFrame: cameraTrack 없음 — publishCamera 먼저 호출하세요.');
  }

  const mediaStreamTrack = _cameraTrack.mediaStreamTrack;
  if (!mediaStreamTrack) {
    throw new Error('[livekit] captureFrame: mediaStreamTrack 없음');
  }

  // 1차: ImageCapture API
  if (typeof ImageCapture !== 'undefined') {
    try {
      const ic = new ImageCapture(mediaStreamTrack);
      const bitmap = await ic.grabFrame();
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      return await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('[livekit] captureFrame: canvas.toBlob 실패'));
        }, 'image/jpeg', 0.85);
      });
    } catch (err) {
      console.warn('[livekit] ImageCapture 실패, canvas fallback:', err?.message);
    }
  }

  // 2차: <video> + <canvas> fallback
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([mediaStreamTrack]);
    video.onloadedmetadata = () => {
      video.play().then(() => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        video.pause();
        video.srcObject = null;
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('[livekit] captureFrame: canvas.toBlob fallback 실패'));
        }, 'image/jpeg', 0.85);
      }).catch(reject);
    };
    video.onerror = reject;
  });
}

/**
 * 로컬 비디오 트랙을 <video> 엘리먼트에 부착한다.
 *
 * @param {import('livekit-client').Room} room
 * @param {HTMLVideoElement} videoEl
 */
export function attachLocalVideo(room, videoEl) {
  const publications = Array.from(room.localParticipant.videoTrackPublications.values());
  for (const pub of publications) {
    if (pub.track) {
      pub.track.attach(videoEl);
      console.log('[livekit] local video attached');
      return;
    }
  }
  console.warn('[livekit] attachLocalVideo: 로컬 비디오 트랙을 찾을 수 없습니다');
}

/**
 * 원격 참가자의 비디오·오디오 트랙을 미디어 엘리먼트에 부착한다.
 * RoomEvent.TrackSubscribed 를 감지하여 자동으로 부착하므로, 룸 연결 직후 호출하면 된다.
 *
 * @param {import('livekit-client').Room} room
 * @param {HTMLVideoElement} videoEl
 * @param {HTMLAudioElement} [audioEl] - 생략 시 비디오 엘리먼트에 오디오도 함께 부착
 */
export function attachRemoteTracks(room, videoEl, audioEl) {
  const LK = getLK();

  function attachTrack(track, participant) {
    if (participant && participant.isLocal) return;
    if (track.kind === LK.Track.Kind.Video) {
      track.attach(videoEl);
      console.log('[livekit] remote video attached');
    } else if (track.kind === LK.Track.Kind.Audio) {
      track.attach(audioEl ?? videoEl);
      console.log('[livekit] remote audio attached');
    }
  }

  room.on(LK.RoomEvent.TrackSubscribed, (track, _publication, participant) => {
    attachTrack(track, participant);
  });

  room.on(LK.RoomEvent.TrackUnsubscribed, (track) => {
    try { track.detach(); } catch (_) { /* noop */ }
  });

  // Attach tracks that were already subscribed before this listener was registered
  // (seller was publishing before the buyer connected).
  for (const participant of room.remoteParticipants.values()) {
    for (const publication of participant.trackPublications.values()) {
      if (publication.isSubscribed && publication.track) {
        attachTrack(publication.track, participant);
      }
    }
  }
}

/**
 * 룸 연결을 해제하고 로컬 트랙을 중지한다.
 *
 * @param {import('livekit-client').Room} room
 * @param {import('livekit-client').LocalTrack[]} [localTracks] - 명시적으로 중지할 로컬 트랙 목록
 */
export function disconnect(room, localTracks = []) {
  _cameraTrack = null;
  _currentZoom = 1;
  for (const track of localTracks) {
    try { track.stop(); } catch (_) { /* noop */ }
  }
  try {
    room.disconnect();
    console.log('[livekit] disconnected');
  } catch (_) { /* noop */ }
}

/**
 * LK-2: connectRoom 또는 publishCamera 에서 발생한 에러를 분류한다.
 *
 * @param {Error} err
 * @returns {{ type: 'connection'|'permission'|'media'|'other', message: string }}
 */
export function classifyConnectError(err) {
  const name = err?.name || err?.constructor?.name || '';

  if (name === 'ConnectionError') {
    return { type: 'connection', message: '서버 연결 실패. 네트워크를 확인하세요.' };
  }

  if (name === 'PermissionDeniedError' || name === 'NotAllowedError') {
    return { type: 'permission', message: '카메라/마이크 권한이 거부됐습니다.' };
  }

  if (
    name === 'NotFoundError' ||
    name === 'MediaDeviceFailure' ||
    name === 'OverconstrainedError'
  ) {
    return { type: 'media', message: '사용 가능한 카메라/마이크가 없습니다.' };
  }

  return { type: 'other', message: err?.message || '알 수 없는 오류' };
}

/**
 * 전면/후면 카메라를 전환한다 (셀러 전용).
 *
 * 현재 트랙의 facingMode를 읽어 반대 방향으로 새 트랙을 생성하고 room에 publish한다.
 * exact 제약이 실패하면 ideal로 폴백한다.
 *
 * @param {import('livekit-client').Room} room
 * @returns {Promise<{ facingMode: 'user' | 'environment' }>}
 */
/**
 * 마이크 송출 on/off 토글.
 * @param {import('livekit-client').Room} room
 * @param {boolean} enabled  true=송출, false=음소거
 * @returns {Promise<boolean>} 적용된 enabled 상태
 */
export async function setMicrophoneEnabled(room, enabled) {
  if (!room?.localParticipant) {
    throw new Error('[livekit] setMicrophoneEnabled: localParticipant 없음');
  }
  await room.localParticipant.setMicrophoneEnabled(enabled);
  return enabled;
}

export async function switchCamera(room) {
  const LK = getLK();

  if (!_cameraTrack) {
    throw new Error('[livekit] switchCamera: cameraTrack 없음 — publishCamera 먼저 호출하세요.');
  }

  const currentFacing = _cameraTrack.mediaStreamTrack?.getSettings()?.facingMode ?? 'environment';
  const nextFacing = currentFacing === 'environment' ? 'user' : 'environment';

  // 기존 트랙 unpublish + stop
  await room.localParticipant.unpublishTrack(_cameraTrack);
  try { _cameraTrack.stop(); } catch (_) { /* noop */ }
  _cameraTrack = null;

  // 새 트랙 생성 (exact → ideal 폴백)
  let newTrack;
  try {
    newTrack = await LK.createLocalVideoTrack({
      facingMode: { exact: nextFacing },
      resolution: LK.VideoPresets.h720.resolution,
    });
    console.log('[livekit] switchCamera: exact', nextFacing);
  } catch (err) {
    console.warn('[livekit] switchCamera: exact 실패, ideal 폴백:', err?.name || err?.message);
    newTrack = await LK.createLocalVideoTrack({
      facingMode: { ideal: nextFacing },
      resolution: LK.VideoPresets.h720.resolution,
    });
    console.log('[livekit] switchCamera: ideal fallback', nextFacing);
  }

  await room.localParticipant.publishTrack(newTrack, {
    simulcast: true,
    videoSimulcastLayers: [LK.VideoPresets.h540, LK.VideoPresets.h216],
  });

  _cameraTrack = newTrack;
  const actualFacing = newTrack.mediaStreamTrack?.getSettings()?.facingMode ?? nextFacing;
  console.log('[livekit] switchCamera done, facingMode=', actualFacing);
  return { facingMode: actualFacing };
}

/**
 * 현재 카메라 트랙에 줌 제약을 적용한다.
 *
 * 브라우저/디바이스가 zoom capability를 지원하지 않으면 조용히 리턴한다.
 * level 값은 지원 범위(min~max) 내로 clamp된다.
 *
 * @param {number} level
 * @returns {Promise<void>}
 */
export async function setZoom(level) {
  if (!_cameraTrack) {
    console.warn('[livekit] setZoom: cameraTrack 없음, 무시');
    return;
  }

  const mst = _cameraTrack.mediaStreamTrack;
  if (!mst) return;

  const capabilities = /** @type {any} */ (mst.getCapabilities?.());
  if (!capabilities?.zoom) {
    // 지원 안 하면 조용히 리턴
    return;
  }

  const { min, max } = capabilities.zoom;
  const clamped = Math.min(Math.max(level, min), max);

  await mst.applyConstraints({ advanced: [{ zoom: clamped }] });
  _currentZoom = clamped;
  console.log('[livekit] setZoom:', clamped);
}

/**
 * 현재 카메라 트랙의 줌 지원 여부와 범위를 반환한다.
 *
 * @returns {{ min: number; max: number; current: number } | null}
 */
export function getZoomRange() {
  if (!_cameraTrack) return null;

  const mst = _cameraTrack.mediaStreamTrack;
  if (!mst) return null;

  const capabilities = /** @type {any} */ (mst.getCapabilities?.());
  if (!capabilities?.zoom) return null;

  const { min, max } = capabilities.zoom;
  return { min, max, current: _currentZoom };
}
