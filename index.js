let peer = null;
let myPeerId = null;
let activeCall = null;
let activeDataConn = null;
let localStream = null;
let incomingCallObj = null;
let selectedCallMode = 'video';
let micMuted = false;
let camOff = false;

// Web Audio API Context with Desktop Autoplay Unlock Listener
let audioCtx = null;

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Global listeners to unlock laptop browser audio on first user click or keypress
window.addEventListener('click', initAudioContext, { once: true });
window.addEventListener('keydown', initAudioContext, { once: true });

function playMessageSound() {
    try {
        initAudioContext();
        if (!audioCtx) return;

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5 note
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.12); // A5 note
        
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start();
        osc.stop(audioCtx.currentTime + 0.25);
    } catch (e) {
        console.warn("Audio Context error:", e);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    initPeerJS();
    setupUIEventListeners();
    initLocalWebcam(true, true);
});

async function initLocalWebcam(videoOn, audioOn) {
    try {
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
        }
        localStream = await navigator.mediaDevices.getUserMedia({ video: videoOn, audio: audioOn });
        const localVideo = document.getElementById('local-video');
        if (localVideo) {
            localVideo.srcObject = localStream;
        }
    } catch (err) {
        console.warn("Webcam access denied or unavailable:", err);
        document.getElementById('local-cam-off').classList.remove('hidden');
    }
}

function setConnectionStatus(message, color = "text-amber-300") {
    const el = document.getElementById('connection-status');
    if (el) { el.textContent = message; el.className = `text-[11px] ${color} font-mono`; }
}

function initPeerJS() {
    setConnectionStatus('Connecting to signaling server...', 'text-amber-300');
    try {
        peer = new Peer({
            host: '0.peerjs.com',
            port: 443,
            secure: true,
            config: { 
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' },
                    {
                        urls: 'turn:openrelay.metered.ca:80',
                        username: 'openrelay',
                        credential: 'openrelay'
                    },
                    {
                        urls: 'turn:openrelay.metered.ca:443',
                        username: 'openrelay',
                        credential: 'openrelay'
                    }
                ] 
            }
        });

        peer.on('open', (id) => {
            myPeerId = id;
            document.getElementById('my-peer-id').innerText = id;
            setConnectionStatus('Online. Ready to connect.', 'text-emerald-300');
        });

        peer.on('error', (err) => {
            console.error("PeerJS error:", err);
            setConnectionStatus(`P2P Error: ${err.type}`, 'text-rose-400');
        });

        // INCOMING CALL HANDLER
        peer.on('call', (call) => {
            incomingCallObj = call;
            const isVideo = call.metadata && call.metadata.type === 'video';
            
            document.getElementById('incoming-call-type').innerText = isVideo ? 'VIDEO' : 'VOICE';
            document.getElementById('incoming-call-icon').className = isVideo ? 'fa-solid fa-video text-2xl' : 'fa-solid fa-phone text-2xl';
            document.getElementById('incoming-peer-id').innerText = `From Node: ${call.peer}`;
            
            document.getElementById('incoming-call-modal').classList.remove('hidden');
        });

        peer.on('connection', (conn) => {
            activeDataConn = conn;
            conn.on('open', () => {
                setConnectionStatus(`Connected to chat: ${conn.peer}`, 'text-emerald-300');
                enableChat();
                setupDataConnectionListeners(conn);
            });
        });
    } catch (err) {
        console.error("PeerJS initialization exception:", err);
        setConnectionStatus('Failed to initialize P2P network.', 'text-rose-400');
    }
}

function setupDataConnectionListeners(conn) {
    conn.on('data', (data) => {
        appendChatMessage("Peer", data, false);
        playMessageSound();
    });
    conn.on('close', () => {
        setConnectionStatus('Chat connection closed.', 'text-amber-400');
        disableChat();
    });
}

function handleCallStream(call) {
    activeCall = call;
    call.on('stream', (remoteStream) => {
        const remoteVideo = document.getElementById('remote-video');
        remoteVideo.srcObject = remoteStream;
        remoteVideo.classList.remove('hidden');
        document.getElementById('remote-placeholder').classList.add('hidden');
        document.getElementById('peer-status-dot').className = "fa-solid fa-circle text-[10px] text-emerald-400";
        document.getElementById('peer-info-label').innerText = `Connected: ${call.peer}`;
        setConnectionStatus('Call active!', 'text-emerald-300');
    });
    call.on('close', () => {
        resetCallUI();
    });
}

function resetCallUI() {
    const remoteVideo = document.getElementById('remote-video');
    remoteVideo.srcObject = null;
    remoteVideo.classList.add('hidden');
    document.getElementById('remote-placeholder').classList.remove('hidden');
    document.getElementById('peer-status-dot').className = "fa-solid fa-circle text-[10px] text-slate-500";
    document.getElementById('peer-info-label').innerText = "Awaiting Peer...";
    setConnectionStatus('Call ended.', 'text-amber-300');
    if (activeCall) { activeCall.close(); activeCall = null; }
}

function enableChat() {
    document.getElementById('chat-input').removeAttribute('disabled');
    document.getElementById('chat-send-btn').removeAttribute('disabled');
    document.getElementById('chat-status').innerText = "ONLINE";
    document.getElementById('chat-status').className = "text-[10px] font-mono text-emerald-400";
}

function disableChat() {
    document.getElementById('chat-input').setAttribute('disabled', 'true');
    document.getElementById('chat-send-btn').setAttribute('disabled', 'true');
    document.getElementById('chat-status').innerText = "OFFLINE";
    document.getElementById('chat-status').className = "text-[10px] font-mono text-slate-500";
}

function appendChatMessage(sender, text, isSelf) {
    const box = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `flex flex-col ${isSelf ? 'items-end' : 'items-start'}`;
    div.innerHTML = `<span class="text-[9px] text-slate-500 mb-0.5">${sender}</span><div class="px-3 py-1.5 rounded-xl max-w-[85%] break-words ${isSelf ? 'bg-indigo-600 text-white' : 'bg-slate-900 border border-slate-700 text-slate-200'}">${text}</div>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function setupUIEventListeners() {
    document.getElementById('copy-id-btn').addEventListener('click', () => {
        if (myPeerId) {
            navigator.clipboard.writeText(myPeerId);
            alert("Copied your Peer ID to clipboard!");
        }
    });

    // Call Mode Tabs
    document.getElementById('tab-video-call').addEventListener('click', async () => {
        selectedCallMode = 'video';
        document.getElementById('tab-video-call').className = "py-1.5 px-3 rounded-lg bg-indigo-600 text-white text-xs font-bold transition flex items-center justify-center gap-1.5";
        document.getElementById('tab-voice-call').className = "py-1.5 px-3 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-xs font-bold transition flex items-center justify-center gap-1.5";
        await initLocalWebcam(true, true);
        document.getElementById('local-cam-off').classList.add('hidden');
    });

    document.getElementById('tab-voice-call').addEventListener('click', async () => {
        selectedCallMode = 'voice';
        document.getElementById('tab-voice-call').className = "py-1.5 px-3 rounded-lg bg-indigo-600 text-white text-xs font-bold transition flex items-center justify-center gap-1.5";
        document.getElementById('tab-video-call').className = "py-1.5 px-3 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-xs font-bold transition flex items-center justify-center gap-1.5";
        await initLocalWebcam(false, true);
        document.getElementById('local-cam-off').classList.remove('hidden');
    });

    document.getElementById('btn-connect-peer').addEventListener('click', () => {
        const targetId = document.getElementById('target-peer-id').value.trim();
        if (!targetId) { alert("Please enter a valid Peer ID."); return; }
        
        setConnectionStatus(`Connecting to ${targetId}...`, 'text-cyan-300');
        const conn = peer.connect(targetId);
        activeDataConn = conn;
        conn.on('open', () => {
            setConnectionStatus(`Connected to chat: ${conn.peer}`, 'text-emerald-300');
            enableChat();
            setupDataConnectionListeners(conn);
        });
    });

    // Start Outgoing Call
    document.getElementById('btn-start-call').addEventListener('click', async () => {
        const targetId = document.getElementById('target-peer-id').value.trim();
        if (!targetId) { alert("Please enter a target Peer ID to call."); return; }
        
        const useVideo = selectedCallMode === 'video';
        if (!localStream) {
            await initLocalWebcam(useVideo, true);
        }
        
        setConnectionStatus(`Calling ${targetId} (${selectedCallMode})...`, 'text-cyan-300');
        const call = peer.call(targetId, localStream, {
            metadata: { type: selectedCallMode }
        });
        handleCallStream(call);
    });

    // Accept Call Modal
    document.getElementById('btn-accept-call').addEventListener('click', async () => {
        document.getElementById('incoming-call-modal').classList.add('hidden');
        if (incomingCallObj) {
            const isVideo = incomingCallObj.metadata && incomingCallObj.metadata.type === 'video';
            await initLocalWebcam(isVideo, true);
            incomingCallObj.answer(localStream);
            handleCallStream(incomingCallObj);
            incomingCallObj = null;
        }
    });

    // Decline Call Modal
    document.getElementById('btn-decline-call').addEventListener('click', () => {
        document.getElementById('incoming-call-modal').classList.add('hidden');
        if (incomingCallObj) {
            incomingCallObj.close();
            incomingCallObj = null;
        }
    });

    document.getElementById('btn-end-call').addEventListener('click', () => {
        resetCallUI();
    });

    document.getElementById('chat-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('chat-input');
        const msg = input.value.trim();
        if (!msg || !activeDataConn) return;
        activeDataConn.send(msg);
        appendChatMessage("You", msg, true);
        input.value = '';
    });

    document.getElementById('btn-show-arch').addEventListener('click', () => {
        document.getElementById('arch-modal').classList.remove('hidden');
    });

    document.getElementById('close-modal-btn').addEventListener('click', () => {
        document.getElementById('arch-modal').classList.add('hidden');
    });

    document.getElementById('modal-ack-btn').addEventListener('click', () => {
        document.getElementById('arch-modal').classList.add('hidden');
    });

    // Mic Mute Toggle
    document.getElementById('btn-toggle-mic').addEventListener('click', () => {
        if (localStream) {
            micMuted = !micMuted;
            localStream.getAudioTracks().forEach(track => track.enabled = !micMuted);
            const btn = document.getElementById('btn-toggle-mic');
            btn.innerHTML = micMuted ? '<i class="fa-solid fa-microphone-slash text-rose-400"></i>' : '<i class="fa-solid fa-microphone"></i>';
        }
    });

    // Camera Mute Toggle
    document.getElementById('btn-toggle-cam').addEventListener('click', () => {
        if (localStream) {
            camOff = !camOff;
            localStream.getVideoTracks().forEach(track => track.enabled = !camOff);
            const btn = document.getElementById('btn-toggle-cam');
            btn.innerHTML = camOff ? '<i class="fa-solid fa-video-slash text-rose-400"></i>' : '<i class="fa-solid fa-video"></i>';
            document.getElementById('local-cam-off').classList.toggle('hidden', !camOff);
        }
    });
}