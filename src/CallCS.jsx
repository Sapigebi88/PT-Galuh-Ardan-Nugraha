
import React, { useCallback, useEffect, useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import {
  Headphones,
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  X,
} from 'lucide-react';

const APP_ID = import.meta.env.VITE_AGORA_APP_ID?.trim() || '';
const CHANNEL_NAME = 'cs-channel';

export default function CallCS({ dark, open, setOpen }) {
  const [status, setStatus] = useState('idle');
  const [muted, setMuted] = useState(false);
  const [message, setMessage] = useState('');
  const [seconds, setSeconds] = useState(0);

  const clientRef = useRef(null);
  const micRef = useRef(null);
  const timerRef = useRef(null);
  const startedAtRef = useRef(null);
  const sessionRef = useRef(0);
  const endingRef = useRef(false);

  const formatTime = (value) =>
    `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(
      value % 60
    ).padStart(2, '0')}`;

  const cleanup = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    startedAtRef.current = null;

    const mic = micRef.current;
    const client = clientRef.current;

    micRef.current = null;
    clientRef.current = null;

    try {
      if (mic) {
        mic.stop();
        mic.close();
      }
    } catch (error) {
      console.warn('Microphone cleanup:', error);
    }

    try {
      if (client) {
        client.removeAllListeners();
        if (client.connectionState !== 'DISCONNECTED') {
          await client.leave();
        }
      }
    } catch (error) {
      console.warn('Agora disconnect:', error);
    }

    setMuted(false);
  }, []);

  const endCall = useCallback(async (userEnded = true) => {
    if (endingRef.current) return;

    endingRef.current = true;
    sessionRef.current += 1;

    await cleanup();

    setStatus('ended');
    setMessage(
      userEnded
        ? 'Panggilan telah diakhiri.'
        : 'Koneksi terputus. Silakan coba kembali.'
    );

    endingRef.current = false;
  }, [cleanup]);

  useEffect(() => {
    if (status !== 'connected') return undefined;

    timerRef.current = setInterval(() => {
      if (startedAtRef.current) {
        setSeconds(
          Math.floor((Date.now() - startedAtRef.current) / 1000)
        );
      }
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [status]);

  useEffect(() => {
    return () => {
      sessionRef.current += 1;
      void cleanup();
    };
  }, [cleanup]);

  const startCall = async () => {
    if (status === 'connecting' || status === 'connected') return;

    if (!APP_ID) {
      setStatus('ended');
      setMessage(
        'App ID Agora belum diisi. Periksa VITE_AGORA_APP_ID pada file .env.'
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('ended');
      setMessage(
        'Akses mikrofon tidak tersedia. Gunakan browser terbaru melalui HTTPS atau localhost.'
      );
      return;
    }

    const session = ++sessionRef.current;
    endingRef.current = false;
    setStatus('connecting');
    setMessage('Menghubungkan ke channel CS...');
    setSeconds(0);

    let client;

    try {
      client = AgoraRTC.createClient({
        mode: 'rtc',
        codec: 'vp8',
      });

      clientRef.current = client;

      client.on('user-published', async (user, mediaType) => {
        if (sessionRef.current !== session) return;

        try {
          await client.subscribe(user, mediaType);

          if (
            sessionRef.current !== session ||
            mediaType !== 'audio' ||
            !user.audioTrack
          ) {
            return;
          }

          user.audioTrack.play();
          startedAtRef.current = Date.now();
          setStatus('connected');
          setMessage('Audio operator CS berhasil diterima.');
        } catch (error) {
          console.error('Subscribe remote audio:', error);
          if (sessionRef.current === session) {
            setMessage('Gagal menerima audio operator CS.');
          }
        }
      });

      client.on('user-left', () => {
        if (sessionRef.current === session) {
          void endCall(false);
        }
      });

      client.on('connection-state-change', (currentState) => {
        if (
          currentState === 'DISCONNECTED' &&
          sessionRef.current === session &&
          !endingRef.current
        ) {
          void endCall(false);
        }
      });

      // Token null: hanya jika project mengizinkan join tanpa token.
      await client.join(APP_ID, CHANNEL_NAME, null, null);

      if (sessionRef.current !== session) {
        await client.leave();
        return;
      }

      const mic = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: 'speech_standard',
        AEC: true,
        ANS: true,
        AGC: true,
      });

      if (sessionRef.current !== session) {
        mic.close();
        await client.leave();
        return;
      }

      micRef.current = mic;
      await client.publish([mic]);

      if (sessionRef.current === session) {
        setMessage(
          'Mikrofon aktif. Menunggu operator CS bergabung ke channel.'
        );
      }
    } catch (error) {
      console.error('Agora voice call error:', error);

      if (sessionRef.current === session) {
        await cleanup();
        setStatus('ended');

        if (
          error?.name === 'NotAllowedError' ||
          error?.name === 'PermissionDeniedError'
        ) {
          setMessage(
            'Izin mikrofon ditolak. Aktifkan izin mikrofon di browser.'
          );
        } else {
          setMessage(
            'Gagal bergabung ke Agora. Periksa App ID, keamanan project, koneksi, dan token.'
          );
        }
      }
    }
  };

  const toggleMute = async () => {
    const mic = micRef.current;
    if (!mic) return;

    try {
      await mic.setEnabled(muted);
      setMuted(!muted);
    } catch (error) {
      console.error('Toggle microphone:', error);
      setMessage('Mikrofon gagal diubah.');
    }
  };

  const closePanel = async () => {
    if (status === 'connecting' || status === 'connected') {
      await endCall(true);
    }
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="cs-floating-button"
        onClick={() => setOpen(true)}
        aria-label="Hubungi CS Online"
      >
        <Headphones size={20} />
        <span>Hubungi CS Online</span>
      </button>

      {open && (
        <div className="cs-call-backdrop">
          <section
            className="cs-call-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cs-title"
            data-theme={dark ? 'dark' : 'light'}
          >
            <button
              type="button"
              className="cs-modal-close"
              onClick={() => void closePanel()}
              aria-label="Tutup"
            >
              <X size={20} />
            </button>

            <div className="cs-call-brand">
              <Headphones size={26} />
              <div>
                <small>PT GALUH ARDAN NUGRAHA (PERSERO)</small>
                <h2 id="cs-title">Customer Service Online</h2>
              </div>
            </div>

            <div className="cs-call-visual">
              <span className="cs-call-ring">
                <Phone size={30} />
              </span>
            </div>

            <h2>
              {status === 'connected'
                ? 'Terhubung'
                : status === 'connecting'
                ? 'Menghubungkan...'
                : status === 'ended'
                ? 'Panggilan Selesai'
                : 'Hubungi CS Online'}
            </h2>

            <p className="cs-call-subtitle">
              {status === 'connected'
                ? 'Panggilan suara sedang berlangsung.'
                : status === 'connecting'
                ? 'Menunggu operator CS bergabung.'
                : 'Panggilan suara langsung melalui browser.'}
            </p>

            <div className="cs-call-status-line">
              <span className={`cs-status-dot ${status}`} />
              <span>
                {status === 'connected'
                  ? 'Terhubung'
                  : status === 'connecting'
                  ? 'Menghubungkan'
                  : status === 'ended'
                  ? 'Tidak aktif'
                  : 'Siap menelepon'}
              </span>
              {status === 'connected' && (
                <strong>{formatTime(seconds)}</strong>
              )}
            </div>

            {message && (
              <p className="cs-call-message" role="status">
                {message}
              </p>
            )}

            <div className="cs-call-controls">
              {status === 'connected' && (
                <button
                  type="button"
                  className="cs-control-button"
                  onClick={() => void toggleMute()}
                >
                  {muted ? <MicOff size={20} /> : <Mic size={20} />}
                  {muted ? 'Aktifkan Mic' : 'Bisukan Mic'}
                </button>
              )}

              {status === 'connecting' || status === 'connected' ? (
                <button
                  type="button"
                  className="cs-end-call"
                  onClick={() => void endCall(true)}
                >
                  <PhoneOff size={20} />
                  Akhiri Panggilan
                </button>
              ) : (
                <button
                  type="button"
                  className="cs-start-call"
                  onClick={() => void startCall()}
                >
                  <Phone size={20} />
                  {status === 'ended' ? 'Coba Lagi' : 'Mulai Panggilan'}
                </button>
              )}
            </div>

            <small className="cs-call-privacy">
              Memerlukan izin mikrofon dan operator CS yang online di channel
              yang sama.
            </small>
          </section>
        </div>
      )}
    </>
  );
}
