class NetworkManager {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.isHost = false;
        this.onConnection = null;
        this.onData = null;
        this.peerId = null;
    }

    init(onOpen) {
        this.peer = new Peer(null, {
            debug: 2
        });

        this.peer.on('open', (id) => {
            console.log('My peer ID is: ' + id);
            this.peerId = id;
            if (onOpen) onOpen(id);
        });

        this.peer.on('connection', (conn) => {
            console.log('Incoming connection...');
            this.handleConnection(conn);
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS Error:', err);
            alert('Network Error: ' + err.type);
        });
    }

    hostGame(onReady) {
        this.isHost = true;
        this.init((id) => {
            if (onReady) onReady(id);
        });
    }

    joinGame(hostId, onConnected) {
        this.isHost = false;
        this.init(() => {
            console.log('Connecting to ' + hostId);
            const conn = this.peer.connect(hostId);
            this.handleConnection(conn);
            if (onConnected) onConnected();
        });
    }

    handleConnection(conn) {
        this.conn = conn;

        this.conn.on('open', () => {
            console.log('Connected to peer!');
            if (this.onConnection) this.onConnection(this.isHost);
        });

        this.conn.on('data', (data) => {
            if (this.onData) this.onData(data);
        });

        this.conn.on('close', () => {
            console.log('Connection closed');
            alert('Connection lost!');
            location.reload();
        });
    }

    send(data) {
        if (this.conn && this.conn.open) {
            this.conn.send(data);
        }
    }
}
