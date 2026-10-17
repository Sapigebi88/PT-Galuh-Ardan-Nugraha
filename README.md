# PT GALUH ARDAN NUGRAHA (PERSERO) — V2.6

React + Vite website update focused on a cleaner interface, scroll-reveal motion, simulated page loading transitions, offline blocking overlay, touch-friendly navigation, and a Formspree contact form.

## Run locally

```bash
npm install
npm run dev
npm run build
```

## Contact form

The contact form is configured to submit to Formspree endpoint `https://formspree.io/f/xgaodqap`. Test the form after deployment and confirm that the Formspree form is enabled and verified in its dashboard.

## SEO / social preview

In `index.html`, replace `https://YOUR-SITE-DOMAIN` with the actual public website URL so canonical and social-preview metadata use the correct domain. The preview image is `public/social-preview.jpg` (1200 × 630).

## Deploy

Run a successful local build, then from the existing project folder:

```bash
git add .
git commit -m "Refactor UI and add offline and page transitions"
git push
```

Keep the existing `.git` folder when copying these updates into the existing local repository.

## V2.7: CS Online Voice Call

The floating `Hubungi CS Online` widget provides a browser-based voice-call interface, microphone permission handling, mute/unmute, call termination, connection state, and a connected-call timer. It uses `getUserMedia`, `RTCPeerConnection`, and a WebSocket signaling channel.

**A real remote call requires a signaling server and an operator-side WebRTC client.** The UI deliberately does not pretend a call is connected when that backend is absent. Configure the Vite environment variable `VITE_CS_SIGNALING_URL` to a secure WebSocket endpoint (`wss://...`) that supports the signaling message contract used by `CSVoiceWidget` in `src/main.jsx`:

- Visitor sends `{ type: "join", room: "pt-galuh-cs", role: "visitor" }`.
- Server notifies the visitor with `{ type: "operator-joined" }` when an operator joins.
- Peers exchange `{ type: "offer" | "answer", room, sdp }` and `{ type: "ice-candidate", room, candidate }` messages.
- The server must relay signaling messages to the other peer in the same room and authenticate/authorize operator sessions.

For production, deploy the signaling server over HTTPS/WSS, add TURN servers for restrictive networks, protect rooms from unauthorized access, and test microphone permissions on mobile browsers. Browser-only code cannot connect two remote people by itself without a signaling service.

Navigation transitions now last approximately 2.1 seconds. The theme toggle retains the existing light/dark state and the call widget follows the active theme.
