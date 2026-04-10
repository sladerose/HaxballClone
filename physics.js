console.log("Loading PhysicsEngine...");
class PhysicsEngine {
    constructor() {
        this.entities = [];
        this.map = {
            segments: [],
            posts: []
        };
        this.width = 0;
        this.height = 0;

        // Constants (Haxball Default)
        this.PLAYER_RADIUS = 15;
        this.BALL_RADIUS = 10;
        this.PLAYER_INV_MASS = 0.5;
        this.BALL_INV_MASS = 1.0;

        this.PLAYER_DAMPING = 0.96;
        this.BALL_DAMPING = 0.99;
        this.PLAYER_ACCEL = 0.1;
        this.KICK_STRENGTH = 5;

        // Map properties
        this.GOAL_WIDTH = 200;
        this.GOAL_DEPTH = 60;
    }

    init(width, height) {
        this.width = width;
        this.height = height;

        this.resetPositions();
        this.createMap();
    }

    createMap() {
        const w = this.width;
        const h = this.height;
        const goalH = this.GOAL_WIDTH;
        const goalD = this.GOAL_DEPTH;

        // Helper to create segments
        const seg = (x1, y1, x2, y2) => ({ x1, y1, x2, y2, nx: 0, ny: 0, len: 0 });

        this.map.segments = [
            // Top Border
            seg(0, 0, w, 0),
            // Bottom Border
            seg(0, h, w, h),
            // Left Top
            seg(0, 0, 0, (h - goalH) / 2),
            // Left Bottom
            seg(0, (h + goalH) / 2, 0, h),
            // Right Top
            seg(w, 0, w, (h - goalH) / 2),
            // Right Bottom
            seg(w, (h + goalH) / 2, w, h),

            // Left Goal Back
            seg(-goalD, (h - goalH) / 2, -goalD, (h + goalH) / 2),
            // Left Goal Top
            seg(0, (h - goalH) / 2, -goalD, (h - goalH) / 2),
            // Left Goal Bottom
            seg(0, (h + goalH) / 2, -goalD, (h + goalH) / 2),

            // Right Goal Back
            seg(w + goalD, (h - goalH) / 2, w + goalD, (h + goalH) / 2),
            // Right Goal Top
            seg(w, (h - goalH) / 2, w + goalD, (h - goalH) / 2),
            // Right Goal Bottom
            seg(w, (h + goalH) / 2, w + goalD, (h + goalH) / 2)
        ];

        // Precompute normals and lengths
        this.map.segments.forEach(s => {
            const dx = s.x2 - s.x1;
            const dy = s.y2 - s.y1;
            s.len = Math.sqrt(dx * dx + dy * dy);
            s.nx = -dy / s.len; // Normal pointing "inward"
            s.ny = dx / s.len;
        });

        // Posts (Goal corners)
        const postR = 8;
        this.map.posts = [
            { x: 0, y: (h - goalH) / 2, radius: postR, color: '#cbd5e1' },
            { x: 0, y: (h + goalH) / 2, radius: postR, color: '#cbd5e1' },
            { x: w, y: (h - goalH) / 2, radius: postR, color: '#cbd5e1' },
            { x: w, y: (h + goalH) / 2, radius: postR, color: '#cbd5e1' }
        ];
    }

    resetPositions() {
        const w = this.width;
        const h = this.height;

        this.entities = [
            // Player 1 (Red)
            {
                id: 'p1', type: 'player', x: w * 0.25, y: h / 2,
                vx: 0, vy: 0, radius: this.PLAYER_RADIUS, color: '#ef4444',
                invMass: this.PLAYER_INV_MASS, damping: this.PLAYER_DAMPING
            },
            // Player 2 (Blue)
            {
                id: 'p2', type: 'player', x: w * 0.75, y: h / 2,
                vx: 0, vy: 0, radius: this.PLAYER_RADIUS, color: '#3b82f6',
                invMass: this.PLAYER_INV_MASS, damping: this.PLAYER_DAMPING
            },
            // Ball
            {
                id: 'ball', type: 'ball', x: w / 2, y: h / 2,
                vx: 0, vy: 0, radius: this.BALL_RADIUS, color: '#ffffff',
                invMass: this.BALL_INV_MASS, damping: this.BALL_DAMPING
            }
        ];
    }

    update(inputP1, inputP2) {
        const p1 = this.entities.find(e => e.id === 'p1');
        const p2 = this.entities.find(e => e.id === 'p2');
        const ball = this.entities.find(e => e.id === 'ball');

        // Apply Input
        if (p1) this.applyPlayerInput(p1, inputP1);
        if (p2) this.applyPlayerInput(p2, inputP2);

        // Kicking Logic
        if (inputP1.shoot && this.checkKick(p1, ball)) this.kick(p1, ball);
        if (inputP2.shoot && this.checkKick(p2, ball)) this.kick(p2, ball);

        // Physics Step
        this.entities.forEach(entity => {
            // Apply Velocity
            entity.x += entity.vx;
            entity.y += entity.vy;

            // Apply Damping
            entity.vx *= entity.damping;
            entity.vy *= entity.damping;

            // Map Collisions
            this.checkMapCollisions(entity);
        });

        // Entity Collisions
        for (let i = 0; i < this.entities.length; i++) {
            for (let j = i + 1; j < this.entities.length; j++) {
                this.resolveEntityCollision(this.entities[i], this.entities[j]);
            }
        }

        // Goal Check
        if (ball.x < -this.BALL_RADIUS) return 'blue_score';
        if (ball.x > this.width + this.BALL_RADIUS) return 'red_score';

        return null;
    }

    applyPlayerInput(player, input) {
        if (input.up) player.vy -= this.PLAYER_ACCEL;
        if (input.down) player.vy += this.PLAYER_ACCEL;
        if (input.left) player.vx -= this.PLAYER_ACCEL;
        if (input.right) player.vx += this.PLAYER_ACCEL;

        // No speed cap needed with damping
    }

    checkKick(player, ball) {
        const dx = ball.x - player.x;
        const dy = ball.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist < (player.radius + ball.radius + 4); // Small buffer
    }

    kick(player, ball) {
        const dx = ball.x - player.x;
        const dy = ball.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist === 0) return;

        const nx = dx / dist;
        const ny = dy / dist;

        ball.vx += nx * this.KICK_STRENGTH;
        ball.vy += ny * this.KICK_STRENGTH;
    }

    checkMapCollisions(entity) {
        // Segments
        for (const seg of this.map.segments) {
            this.resolveSegmentCollision(entity, seg);
        }
        // Posts
        for (const post of this.map.posts) {
            this.resolveCircleCollision(entity, post, true); // true = static
        }
    }

    resolveSegmentCollision(circle, seg) {
        // Vector from seg start to circle center
        const c1x = circle.x - seg.x1;
        const c1y = circle.y - seg.y1;

        // Project onto segment vector
        const dx = seg.x2 - seg.x1;
        const dy = seg.y2 - seg.y1;
        const t = (c1x * dx + c1y * dy) / (seg.len * seg.len);

        // Closest point on segment
        let closestX, closestY;
        if (t < 0) { closestX = seg.x1; closestY = seg.y1; }
        else if (t > 1) { closestX = seg.x2; closestY = seg.y2; }
        else { closestX = seg.x1 + t * dx; closestY = seg.y1 + t * dy; }

        // Distance check
        const distX = circle.x - closestX;
        const distY = circle.y - closestY;
        const dist = Math.sqrt(distX * distX + distY * distY);

        if (dist < circle.radius) {
            // Collision!
            const nx = distX / dist;
            const ny = distY / dist;
            const pen = circle.radius - dist;

            // Push out
            circle.x += nx * pen;
            circle.y += ny * pen;

            // Bounce
            const velAlongNormal = circle.vx * nx + circle.vy * ny;
            if (velAlongNormal < 0) {
                const e = 0.5; // Bounciness
                const j = -(1 + e) * velAlongNormal;
                circle.vx += j * nx;
                circle.vy += j * ny;
            }
        }
    }

    resolveEntityCollision(c1, c2) {
        this.resolveCircleCollision(c1, c2, false);
    }

    resolveCircleCollision(c1, c2, c2Static) {
        const dx = c2.x - c1.x;
        const dy = c2.y - c1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = c1.radius + (c2.radius || c2.radius);

        if (dist < minDist && dist > 0) {
            const nx = dx / dist;
            const ny = dy / dist;
            const pen = minDist - dist;

            // Separation
            if (c2Static) {
                c1.x -= nx * pen;
                c1.y -= ny * pen;
            } else {
                const totalInvMass = c1.invMass + c2.invMass;
                const r1 = c1.invMass / totalInvMass;
                const r2 = c2.invMass / totalInvMass;

                c1.x -= nx * pen * r1;
                c1.y -= ny * pen * r1;
                c2.x += nx * pen * r2;
                c2.y += ny * pen * r2;
            }

            // Impulse
            const dvx = (c2.vx || 0) - c1.vx;
            const dvy = (c2.vy || 0) - c1.vy;
            const velAlongNormal = dvx * nx + dvy * ny;

            if (velAlongNormal > 0) return;

            const bCoef = 0.5; // Haxball default bounce
            let j = -(1 + bCoef) * velAlongNormal;

            if (c2Static) {
                // Static object has infinite mass (invMass = 0)
                c1.vx -= j * nx;
                c1.vy -= j * ny;
            } else {
                j /= (c1.invMass + c2.invMass);
                c1.vx -= j * nx * c1.invMass;
                c1.vy -= j * ny * c1.invMass;
                c2.vx += j * nx * c2.invMass;
                c2.vy += j * ny * c2.invMass;
            }
        }
    }
}
