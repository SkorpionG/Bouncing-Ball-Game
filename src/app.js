const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const canvasWidth = canvas.width;
const canvasHeight = canvas.height;

const debug = false;

const GAME_CONFIG = {
  frameIntervalMs: debug ? 100 : 25,
  ball: {
    x: 160,
    y: 60,
    radius: 20,
    speedX: 20,
    speedY: 20,
    color: "yellow",
  },
  paddle: {
    x: 100,
    y: 500,
    width: 200,
    height: 5,
    color: "orange",
  },
  brick: {
    width: 50,
    height: 50,
    total: 10,
    color: "lightgreen",
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isCircleIntersectingRect(circle, rect) {
  const closestX = clamp(circle.x, rect.x, rect.x + rect.width);
  const closestY = clamp(circle.y, rect.y, rect.y + rect.height);
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy <= circle.radius * circle.radius;
}

class Brick {
  static width = GAME_CONFIG.brick.width;
  static height = GAME_CONFIG.brick.height;

  constructor(x, y, color = GAME_CONFIG.brick.color) {
    this.x = x;
    this.y = y;
    this.width = Brick.width;
    this.height = Brick.height;
    this.color = color;
    this.visible = true;
  }

  draw(context) {
    if (!this.visible) {
      return;
    }
    context.fillStyle = this.color;
    context.fillRect(this.x, this.y, this.width, this.height);
  }
}

class Paddle {
  constructor({ x, y, width, height, color }) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.color = color;
  }

  moveToCenter(centerX, maxCanvasWidth) {
    this.x = clamp(centerX - this.width / 2, 0, maxCanvasWidth - this.width);
  }

  draw(context) {
    context.fillStyle = this.color;
    context.fillRect(this.x, this.y, this.width, this.height);
  }
}

class Ball {
  constructor({ x, y, radius, speedX, speedY, color }) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.speedX = speedX;
    this.speedY = speedY;
    this.color = color;
  }

  move() {
    this.x += this.speedX;
    this.y += this.speedY;
  }

  handleWallCollision(maxCanvasWidth, maxCanvasHeight) {
    if (this.x - this.radius <= 0) {
      this.x = this.radius;
      this.speedX = Math.abs(this.speedX);
    } else if (this.x + this.radius >= maxCanvasWidth) {
      this.x = maxCanvasWidth - this.radius;
      this.speedX = -Math.abs(this.speedX);
    }

    if (this.y - this.radius <= 0) {
      this.y = this.radius;
      this.speedY = Math.abs(this.speedY);
    } else if (this.y + this.radius >= maxCanvasHeight) {
      this.y = maxCanvasHeight - this.radius;
      this.speedY = -Math.abs(this.speedY);
    }
  }

  handlePaddleCollision(paddle, prevY) {
    if (!isCircleIntersectingRect(this, paddle)) {
      return;
    }

    if (prevY + this.radius <= paddle.y) {
      this.y = paddle.y - this.radius;
      this.speedY = -Math.abs(this.speedY);
    } else if (prevY - this.radius >= paddle.y + paddle.height) {
      this.y = paddle.y + paddle.height + this.radius;
      this.speedY = Math.abs(this.speedY);
    } else if (this.x < paddle.x + paddle.width / 2) {
      this.x = paddle.x - this.radius;
      this.speedX = -Math.abs(this.speedX);
    } else {
      this.x = paddle.x + paddle.width + this.radius;
      this.speedX = Math.abs(this.speedX);
    }
  }

  draw(context) {
    context.beginPath();
    context.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
    context.fillStyle = this.color;
    context.fill();
  }
}

function createBricks(totalBricks, maxCanvasWidth, paddleY, ball) {
  const columns = Math.floor(maxCanvasWidth / Brick.width);
  const maxRowsAbovePaddle = Math.floor(paddleY / Brick.height);
  const candidates = [];

  for (let row = 0; row < maxRowsAbovePaddle; row++) {
    for (let col = 0; col < columns; col++) {
      const cellRect = {
        x: col * Brick.width,
        y: row * Brick.height,
        width: Brick.width,
        height: Brick.height,
      };
      if (!isCircleIntersectingRect(ball, cellRect)) {
        candidates.push(cellRect);
      }
    }
  }

  // Fisher-Yates shuffle to guarantee unique, non-overlapping positions.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const count = Math.min(totalBricks, candidates.length);
  return candidates
    .slice(0, count)
    .map((cell) => new Brick(cell.x, cell.y, GAME_CONFIG.brick.color));
}

function resolveBrickBounceAxes(ball, brick, prevX, prevY) {
  const hitHorizontal =
    prevX + ball.radius <= brick.x || prevX - ball.radius >= brick.x + brick.width;
  const hitVertical =
    prevY + ball.radius <= brick.y || prevY - ball.radius >= brick.y + brick.height;

  if (hitHorizontal && !hitVertical) {
    return { flipX: true, flipY: false };
  }
  if (hitVertical && !hitHorizontal) {
    return { flipX: false, flipY: true };
  }

  const closestX = clamp(ball.x, brick.x, brick.x + brick.width);
  const closestY = clamp(ball.y, brick.y, brick.y + brick.height);
  const dx = Math.abs(ball.x - closestX);
  const dy = Math.abs(ball.y - closestY);

  if (dx > dy) {
    return { flipX: true, flipY: false };
  }
  if (dy > dx) {
    return { flipX: false, flipY: true };
  }
  return { flipX: true, flipY: true };
}

function handleBrickCollisions(ball, bricks, prevX, prevY) {
  let flippedX = false;
  let flippedY = false;
  let hits = 0;

  for (const brick of bricks) {
    if (!brick.visible || !isCircleIntersectingRect(ball, brick)) {
      continue;
    }

    brick.visible = false;
    hits += 1;

    const { flipX, flipY } = resolveBrickBounceAxes(ball, brick, prevX, prevY);
    if (flipX && !flippedX) {
      ball.speedX *= -1;
      flippedX = true;
    }
    if (flipY && !flippedY) {
      ball.speedY *= -1;
      flippedY = true;
    }
  }

  return hits;
}

const ball = new Ball(GAME_CONFIG.ball);
const paddle = new Paddle(GAME_CONFIG.paddle);
const bricks = createBricks(GAME_CONFIG.brick.total, canvasWidth, paddle.y, ball);

let destroyedCount = 0;
let isGameOver = false;

canvas.addEventListener("pointermove", (event) => {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) {
    return;
  }
  const scaleX = canvas.width / rect.width;
  const pointerX = (event.clientX - rect.left) * scaleX;
  paddle.moveToCenter(pointerX, canvasWidth);
});

function render() {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  for (const brick of bricks) {
    brick.draw(ctx);
  }
  paddle.draw(ctx);
  ball.draw(ctx);
}

let gameLoopId = null;

function updateGame() {
  if (isGameOver) {
    return;
  }

  const prevX = ball.x;
  const prevY = ball.y;

  ball.move();
  ball.handleWallCollision(canvasWidth, canvasHeight);
  ball.handlePaddleCollision(paddle, prevY);
  destroyedCount += handleBrickCollisions(ball, bricks, prevX, prevY);

  render();

  if (destroyedCount >= bricks.length) {
    isGameOver = true;
    clearInterval(gameLoopId);
    setTimeout(() => {
      alert("遊戲結束");
    }, 16);
  }
}

render();
gameLoopId = setInterval(updateGame, GAME_CONFIG.frameIntervalMs);
