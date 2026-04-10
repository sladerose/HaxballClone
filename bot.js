class SimpleBot {
    constructor(playerId, targetGoalX) {
        this.id = playerId;
        this.targetX = targetGoalX; // The X coordinate of the goal we want to score in
        this.reactionDelay = 0;
    }

    update(me, ball) {
        const input = { up: false, down: false, left: false, right: false, shoot: false };

        if (!me || !ball) return input;

        // Target calculation
        let targetX = ball.x;
        let targetY = ball.y;

        // Simple strategy:
        // If ball is behind us (closer to our goal), get behind the ball first
        // "Our goal" is opposite to targetX. 
        // Assuming P2 (Blue) is the bot, its goal is at X=width (right), it attacks 0 (left).
        // Wait, standard Haxball: P1 (Red) is Left, attacks Right. P2 (Blue) is Right, attacks Left.

        const attackingRight = this.targetX > me.x;

        // Determine "behind" based on attack direction
        const isBehindBall = attackingRight ? (me.x < ball.x) : (me.x > ball.x);

        if (!isBehindBall) {
            // We are ahead of the ball, we need to get behind it to kick it forward
            // Move to a point "behind" the ball
            const offset = attackingRight ? -30 : 30;
            targetX = ball.x + offset;
            targetY = ball.y;
        } else {
            // We are in position, aim for the ball (and slightly towards goal)
            targetX = ball.x;
            targetY = ball.y;
        }

        // Movement Logic
        const dx = targetX - me.x;
        const dy = targetY - me.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const threshold = 5;

        if (Math.abs(dx) > threshold) {
            if (dx > 0) input.right = true;
            else input.left = true;
        }

        if (Math.abs(dy) > threshold) {
            if (dy > 0) input.down = true;
            else input.up = true;
        }

        // Shooting Logic
        // Shoot if we are close to the ball and facing the goal roughly
        if (dist < 35) {
            // Check alignment
            const angleToGoal = Math.atan2(me.y - ball.y, me.x - this.targetX); // Rough check
            // Just spam shoot when close for now, simple aggression
            input.shoot = true;
        }

        return input;
    }
}
