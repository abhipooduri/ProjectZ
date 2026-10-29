function initPeerJS() {
    setConnectionStatus('Connecting to signaling server...', 'text-amber-300');
    
    // Safety fallback timeout: if peer doesn't open in 5 seconds, alert user
    const initTimer = setTimeout(() => {
        if (!myPeerId) {
            setConnectionStatus('Connection timed out. Check network/firewall.', 'text-rose-400');
            console.warn("PeerJS connection timed out. Network firewall may be blocking secure WebSockets.");
        }
    }, 5000);

    try {
        // Explicitly initializing with standard options
        peer = new Peer({
            host: '0.peerjs.com',
            port: 443,
            secure: true,
            debug: 3
        });

        peer.on('open', (id) => {
            clearTimeout(initTimer);
            myPeerId = id;
            document.getElementById('my-peer-id').innerText = id;
            setConnectionStatus('Online. Ready to connect.', 'text-emerald-300');
        });

        peer.on('error', (err) => {
            clearTimeout(initTimer);
            console.error("PeerJS error event fired:", err);
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
        clearTimeout(initTimer);
        console.error("PeerJS initialization exception:", err);
        setConnectionStatus('Failed to initialize P2P network.', 'text-rose-400');
    }
}
