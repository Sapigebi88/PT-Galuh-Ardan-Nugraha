import React, { useCallback, useEffect, useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { Headphones, Phone, PhoneOff, Mic, MicOff, X } from 'lucide-react';

const AGORA_APP_ID = import.meta.env.VITE_AGORA_APP_ID?.trim() || '';
const AGORA_CHANNEL = import.meta.env.VITE_AGORA_CHANNEL?.trim() || 'pt-galuh-cs';

/**
 * Browser-side visitor widget. The CS operator must join the same Agora project
 * and channel using an operator client. Never put an Agora App Certificate here.
 */
export default function CSVoiceWidget({ dark, open, setOpen }) {
  const [status, setStatus] = useState('idle');
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState('');
  const clientRef = useRef(null);
  const localTrackRef = useRef(null);
  const timerRef = useRef(null);
  const connectedAtRef = useRef(null);
  const sessionRef = useRef(0);
  const endingRef = useRef(false);

  const formatTime = (seconds) =>
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  const cleanup = useCallback(async () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    connectedAtRef.current = null;
    const client = clientRef.current;
    clientRef.current = null;
    const localTrack = localTrackRef.current;
    localTrackRef.current = null;
    try {
      if (localTrack) {
        localTrack.stop();
        localTrack.close();
      }
    } catch { /* track may already be closed */ }
    try {
      if (client) {
        client.removeAllListeners();
        if (client.connectionState !== 'DISCONNECTED') await client.leave();
      }
    } catch { /* client may already have left */ }
    setMuted(false);
  }, []);

  useEffect(() => {
    if (status !== 'connected') return undefined;
    timerRef.current = window.setInterval(() => {
      if (connectedAtRef.current) setElapsed(Math.floor((Date.now() - connectedAtRef.current) / 1000));
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [status]);

  useEffect(() => () => {
    sessionRef.current += 1;
    void cleanup();
  }, [cleanup]);

  const endCall = useCallback(async (closedByUser = true) => {
    if (endingRef.current) return;
    endingRef.current = true;
    sessionRef.current += 1;
    await cleanup();
    setStatus('ended');
    setMessage(closedByUser ? 'Panggilan telah ditutup.' : 'Koneksi panggilan berakhir. Silakan coba lagi.');
    endingRef.current = false;
  }, [cleanup]);

  const startCall = async () => {
    if (!AGORA_APP_ID) {
      setStatus('ended');
      setMessage('Panggilan CS belum dikonfigurasi. App ID Agora belum diisi pada VITE_AGORA_APP_ID.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('ended');
      setMessage('Browser ini tidak mendukung akses mikrofon. Gunakan browser terbaru melalui HTTPS.');
      return;
    }

    const sessionId = ++sessionRef.current;
    endingRef.current = false;
    setMessage('');
    setElapsed(0);
    setMuted(false);
    setStatus('connecting');

    try {
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      clientRef.current = client;

      client.on('user-joined', () => {
        if (sessionRef.current === sessionId) setMessage('Operator CS masuk ke ruang panggilan. Menyiapkan audio...');
      });

      client.on('user-published', async (user, mediaType) => {
        if (sessionRef.current !== sessionId) return;
        try {
          await client.subscribe(user, mediaType);
          if (mediaType === 'audio' && user.audioTrack) {
            user.audioTrack.play();
            setStatus('connected');
            connectedAtRef.current = Date.now();
            setMessage('Anda sudah terhubung dengan CS online.');
          }
        } catch {
          if (sessionRef.current === sessionId) setMessage('Audio CS belum dapat diputar. Periksa izin audio browser.');
        }
      });

      client.on('user-left', () => {
        if (sessionRef.current === sessionId) void endCall(false);
      });

      client.on('connection-state-change', (currentState) => {
        if (sessionRef.current !== sessionId) return;
        if (currentState === 'DISCONNECTED' && !endingRef.current) {
          void endCall(false);
        }
      });

      // A null token is suitable only when the Agora project allows tokenless joining.
      // If token authentication is enabled, request a short-lived token from your backend.
      await client.join(AGORA_APP_ID, AGORA_CHANNEL, null, null);
      if (sessionRef.current !== sessionId) {
        try { await client.leave(); } catch { /* no-op */ }
        return;
      }
      const microphoneTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: 'speech_standard',
        AEC: true,
        ANS: true,
        AGC: true,
      });
      if (sessionRef.current !== sessionId) {
        microphoneTrack.close();
        try { await client.leave(); } catch { /* no-op */ }
        return;
      }
      localTrackRef.current = microphoneTrack;
      await client.publish([microphoneTrack]);
      setMessage('Mikrofon aktif. Menunggu operator CS bergabung ke ruang panggilan...');
    } catch (error) {
      await cleanup();
      setStatus('ended');
      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        setMessage('Izin mikrofon ditolak. Izinkan akses mikrofon di pengaturan browser untuk melanjutkan.');
      } else if (error?.code === 'CAN_NOT_GET_GATEWAY_SERVER' || error?.code === 'UID_CONFLICT') {
        setMessage('Agora tidak dapat menyambungkan panggilan. Periksa App ID, channel, dan konfigurasi proyek.');
      } else {
        setMessage('Panggilan belum dapat dimulai. Pastikan App ID, token (jika diwajibkan), dan konfigurasi Agora sudah benar.');
      }
    }
  };

  const toggleMute = async () => {
    const track = localTrackRef.current;
    if (!track) return;
    const nextMuted = !muted;
    try {
      await track.setEnabled(!nextMuted);
      setMuted(nextMuted);
    } catch {
      setMessage('Pengaturan mikrofon tidak dapat diubah.');
    }
  };

  const closePanel = async () => {
    if (status === 'connecting' || status === 'connected') await endCall(true);
    setOpen(false);
  };

  return (
    <>
      <button className="cs-floating-button" onClick={() => setOpen(true)} aria-label="Hubungi CS Online">
        <Headphones size={20} aria-hidden="true" /><span>Hubungi CS Online</span>
      </button>
      {open && (
        <div className="cs-call-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) void closePanel();
        }}>
          <section className="cs-call-modal" role="dialog" aria-modal="true" aria-labelledby="cs-call-title">
            <button className="cs-modal-close" onClick={() => void closePanel()} aria-label="Tutup panel"><X size={20} /></button>
            <div className="cs-call-brand">
              <span className="cs-call-brand-icon"><Headphones size={26} /></span>
              <span><small>PT GALUH ARDAN NUGRAHA (PERSERO)</small><strong id="cs-call-title">Customer Service Online</strong></span>
            </div>
            <div className="cs-call-visual">
              <span className={'cs-call-ring ' + (status === 'connecting' || status === 'connected' ? 'active' : '')}><Phone size={32} /></span>
            </div>
            <h2>{status === 'connected' ? 'Terhubung' : status === 'connecting' ? 'Menghubungkan...' : status === 'ended' ? 'Panggilan Berakhir' : 'Hubungi CS Online'}</h2>
            <p className="cs-call-subtitle">{status === 'connected' ? 'Anda sedang berada dalam panggilan suara.' : status === 'connecting' ? 'Menghubungkan ke ruang panggilan Agora dan menunggu operator CS.' : status === 'ended' ? 'Sesi panggilan belum aktif atau sudah selesai.' : 'Dapatkan bantuan melalui panggilan suara langsung dari browser.'}</p>
            <div className="cs-call-status-line">
              <span className={'cs-status-dot ' + status} />
              <span>{status === 'connected' ? 'Terhubung' : status === 'connecting' ? 'Menghubungkan...' : status === 'ended' ? 'Panggilan Berakhir' : 'Siap melakukan panggilan'}</span>
              <strong>{status === 'connected' ? formatTime(elapsed) : ''}</strong>
            </div>
            {message && <p className="cs-call-message" role="status">{message}</p>}
            <div className="cs-call-controls">
              {status === 'connected' && <button className={'cs-control-button ' + (muted ? 'muted' : '')} onClick={toggleMute} aria-label={muted ? 'Aktifkan mikrofon' : 'Bisukan mikrofon'}>
                {muted ? <MicOff size={21} /> : <Mic size={21} />}<span>{muted ? 'Aktifkan Mic' : 'Bisukan Mic'}</span>
              </button>}
              {status === 'connecting' || status === 'connected' ? <button className="cs-end-call" onClick={() => void endCall(true)}><PhoneOff size={20} /><span>Akhiri Panggilan</span></button> : <button className="cs-start-call" onClick={startCall}><Phone size={20} /><span>{status === 'ended' ? 'Coba Lagi' : 'Mulai Panggilan'}</span></button>}
            </div>
            <small className="cs-call-privacy">Panggilan memerlukan izin mikrofon, koneksi internet stabil, dan operator CS yang bergabung ke channel yang sama.</small>
          </section>
        </div>
      )}
    </>
  );
}
