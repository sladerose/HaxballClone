console.log("Loading Game...");

class Game {
    constructor() {
        console.log("Game initialized");
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.physics = new PhysicsEngine();

        this.lastTime = 0;
        this.accumulator = 0;
        this.isRunning = false;

        this.ui = {
            menu: document.getElementById('main-menu'),
            hud: document.getElementById('hud'),
            btnSingle: document.getElementById('btn-single'),
            btnLocal: document.getElementById('btn-local'),
            btnHost: document.getElementById('btn-host'),
            btnJoin: document.getElementById('btn-join'),
            joinInput: document.getElementById('room-id-input'),
            lobby: document.getElementById('lobby-status'),
            roomIdDisplay: document.getElementById('room-id-display'),
            btnCopy: document.getElementById('btn-copy-id')
        };

        this.network = new NetworkManager();
        this.bot = null;
        this.networkMode = 'local'; // 'local', 'host', 'client', 'single'
        this.remoteInput = {};

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.setupEventListeners();

        // Input state
        this.keys = {};
        window.addEventListener('keydown', (e) => this.keys[e.code] = true);
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        this.matchTime = 3 * 60; // 3 minutes
        this.currentTime = this.matchTime;
        this.isGameOver = false;
    }

    setupEventListeners() {
        if (this.ui.btnSingle) {
            this.ui.btnSingle.addEventListener('click', () => this.startSinglePlayerGame());
        }

        if (this.ui.btnLocal) {
            this.ui.btnLocal.addEventListener('click', () => this.startLocalGame());
        }

        if (this.ui.btnHost) {
            this.ui.btnHost.addEventListener('click', () => {
                this.ui.lobby.classList.remove('hidden');
                this.network.hostGame((id) => {
                    this.ui.roomIdDisplay.textContent = id;
                });
                this.network.onConnection = () => this.startOnlineGame('host');
            });
        }

        if (this.ui.btnJoin) {
            this.ui.btnJoin.addEventListener('click', () => {
                const id = this.ui.joinInput.value;
                if (!id) return alert("Enter a Room ID!");
                this.network.joinGame(id, () => {
                    this.startOnlineGame('client');
                });
            });
        }

        if (this.ui.btnCopy) {
            this.ui.btnCopy.addEventListener('click', () => {
                navigator.clipboard.writeText(this.ui.roomIdDisplay.textContent);
                alert("Copied to clipboard!");
            });
        }

        // Network Data Handler
        this.network.onData = (data) => this.handleNetworkData(data);
    }

    resize() {
        this.canvas.width = window.innerWidth * 0.8;
        this.canvas.height = window.innerHeight * 0.8;
    }

    startLocalGame() {
        console.log("Starting local game...");
        this.networkMode = 'local';
        this.startGame();
    }

    startSinglePlayerGame() {
        console.log("Starting single player game...");
        this.networkMode = 'single';
        // Bot plays as P2 (Blue), attacks Left (0)
        this.bot = new SimpleBot('p2', 0);
        this.startGame();
    }

    startOnlineGame(mode) {
        console.log(`Starting online game as ${mode}...`);
        this.networkMode = mode;
        this.startGame();
    }

    startGame() {
        this.ui.menu.classList.add('hidden');
        this.ui.hud.classList.remove('hidden');
        this.isRunning = true;
        this.isGameOver = false;
        this.currentTime = this.matchTime;
        this.physics.init(this.canvas.width, this.canvas.height);
        this.updateTimerDisplay();
        requestAnimationFrame((t) => this.loop(t));
    }

    loop(timestamp) {
        if (!this.isRunning) return;

        const deltaTime = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        // Fixed Timestep Accumulator
        this.accumulator += deltaTime;
        const fixedStep = 1 / 60; // 60 Hz

        if (this.accumulator > 0.2) this.accumulator = 0.2;

        while (this.accumulator >= fixedStep) {
            this.update(fixedStep);
            this.accumulator -= fixedStep;
        }

        this.render();
        requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
        if (this.isGameOver) return;

        // Input Gathering
        const localInput = {
            up: this.keys['KeyW'] || this.keys['ArrowUp'],
            down: this.keys['KeyS'] || this.keys['ArrowDown'],
            left: this.keys['KeyA'] || this.keys['ArrowLeft'],
            right: this.keys['KeyD'] || this.keys['ArrowRight'],
            shoot: this.keys['Space'] || this.keys['ShiftRight']
        };

        let inputP1 = {}, inputP2 = {};

        if (this.networkMode === 'local') {
            inputP1 = {
                up: this.keys['KeyW'], down: this.keys['KeyS'],
                left: this.keys['KeyA'], right: this.keys['KeyD'], shoot: this.keys['Space']
            };
            inputP2 = {
                up: this.keys['ArrowUp'], down: this.keys['ArrowDown'],
                left: this.keys['ArrowLeft'], right: this.keys['ArrowRight'], shoot: this.keys['ShiftRight']
            };
        } else if (this.networkMode === 'single') {
            inputP1 = localInput; // Player is P1
            // Bot Input
            const p2Entity = this.physics.entities.find(e => e.id === 'p2');
            const ballEntity = this.physics.entities.find(e => e.id === 'ball');
            if (this.bot) {
                inputP2 = this.bot.update(p2Entity, ballEntity);
            }
        } else if (this.networkMode === 'host') {
            inputP1 = localInput; // Host is P1
            inputP2 = this.remoteInput || {}; // Client is P2
        } else if (this.networkMode === 'client') {
            // Client sends input to host
            this.network.send({ type: 'input', input: localInput });
            return; // Client doesn't run physics, just renders state
        }

        // Timer (Host only or Local)
        this.currentTime -= dt;
        if (this.currentTime <= 0) {
            this.currentTime = 0;
            this.endGame();
        }
        this.updateTimerDisplay();

        // Physics Update
        const event = this.physics.update(inputP1, inputP2);

        if (event === 'red_score') this.handleGoal('red');
        if (event === 'blue_score') this.handleGoal('blue');

        // Broadcast State (Host only)
        if (this.networkMode === 'host') {
            this.broadcastState();
        }
    }

    handleNetworkData(data) {
        if (this.networkMode === 'host' && data.type === 'input') {
            this.remoteInput = data.input;
        } else if (this.networkMode === 'client' && data.type === 'state') {
            this.applyState(data.state);
        }
    }

    broadcastState() {
        const state = {
            entities: this.physics.entities.map(e => ({
                id: e.id, x: e.x, y: e.y, vx: e.vx, vy: e.vy
            })),
            time: this.currentTime,
            scoreRed: document.querySelector('.team.red').textContent,
            scoreBlue: document.querySelector('.team.blue').textContent
        };
        this.network.send({ type: 'state', state: state });
    }

    applyState(state) {
        // Update Entities
        state.entities.forEach(sEntity => {
            const entity = this.physics.entities.find(e => e.id === sEntity.id);
            if (entity) {
                entity.x = sEntity.x;
                entity.y = sEntity.y;
                entity.vx = sEntity.vx;
                entity.vy = sEntity.vy;
            }
        });

        // Update HUD
        this.currentTime = state.time;
        this.updateTimerDisplay();
        document.querySelector('.team.red').textContent = state.scoreRed;
        document.querySelector('.team.blue').textContent = state.scoreBlue;
    }

    updateTimerDisplay() {
        const mins = Math.floor(this.currentTime / 60);
        const secs = Math.floor(this.currentTime % 60);
        const timerEl = document.querySelector('.timer');
        if (timerEl) {
            timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        }
    }

    handleGoal(team) {
        // Update Score
        const scoreEl = document.querySelector(`.team.${team}`);
        if (scoreEl) {
            scoreEl.textContent = parseInt(scoreEl.textContent) + 1;
        }

        // Flash Effect
        const flash = document.createElement('div');
        flash.style.position = 'absolute';
        flash.style.top = '0';
        flash.style.left = '0';
        flash.style.width = '100%';
        flash.style.height = '100%';
        flash.style.backgroundColor = team === 'red' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)';
        flash.style.pointerEvents = 'none';
        flash.style.transition = 'opacity 0.5s';
        document.body.appendChild(flash);

        setTimeout(() => {
            flash.style.opacity = '0';
            setTimeout(() => flash.remove(), 500);
        }, 100);

        // Reset
        this.physics.resetPositions();
    }

    endGame() {
        this.isGameOver = true;
        this.isRunning = false;
        alert("GAME OVER!"); // Placeholder for better UI
        location.reload(); // Simple reset for now
    }

    render() {
        // Clear screen
        this.ctx.fillStyle = '#1a2236'; // Match CSS canvas bg
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Glow Effect
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = 'rgba(255, 255, 255, 0.2)';

        // Draw Field Lines (Map Segments)
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.lineWidth = 3;

        this.ctx.beginPath();
        this.physics.map.segments.forEach(seg => {
            this.ctx.moveTo(seg.x1, seg.y1);
            this.ctx.lineTo(seg.x2, seg.y2);
        });
        this.ctx.stroke();

        // Draw Posts
        this.physics.map.posts.forEach(post => {
            this.ctx.beginPath();
            this.ctx.arc(post.x, post.y, post.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = post.color;
            this.ctx.shadowColor = post.color;
            this.ctx.fill();
        });

        // Center line
        this.ctx.shadowBlur = 0; // Reset for lines
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvas.width / 2, 0);
        this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
        this.ctx.stroke();

        // Center circle
        this.ctx.beginPath();
        this.ctx.arc(this.canvas.width / 2, this.canvas.height / 2, 70, 0, Math.PI * 2);
        this.ctx.stroke();

        // Render Entities
        this.physics.entities.forEach(entity => {
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = entity.color;

            this.ctx.beginPath();
            this.ctx.arc(entity.x, entity.y, entity.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = entity.color;
            this.ctx.fill();

            // Stroke for visibility
            this.ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Draw kick indicator if player
            if (entity.type === 'player') {
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                this.ctx.beginPath();
                this.ctx.arc(entity.x, entity.y, entity.radius + 4, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });

        this.ctx.shadowBlur = 0; // Reset
    }
}

// Start the game instance
window.game = new Game();
