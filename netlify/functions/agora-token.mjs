import { RtcTokenBuilder, RtcRole } from 'agora-access-token';

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    return new Response(JSON.stringify({
      error: 'AGORA_APP_ID atau AGORA_APP_CERTIFICATE belum diatur di Netlify.',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Request tidak valid.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const channel = body?.channel;
  const uid = Number(body?.uid);

  // Hanya izinkan channel yang dipakai fitur CS ini.
  if (channel !== 'cs-channel' || !Number.isSafeInteger(uid) || uid < 1 || uid > 2_000_000_000) {
    return new Response(JSON.stringify({ error: 'Channel atau UID tidak valid.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channel,
    uid,
    RtcRole.PUBLISHER,
    now + 60 * 60,
    now + 60 * 60
  );

  return new Response(JSON.stringify({ token }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
