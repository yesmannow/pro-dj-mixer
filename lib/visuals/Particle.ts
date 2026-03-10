export class Particle {
  x: number; y: number; vx: number; vy: number; baseSize: number; currentSize: number;
  color: string; alpha: number; glow: boolean;

  constructor(width: number, height: number, isEmber: boolean) {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.vx = (Math.random() - 0.5) * 0.4;
    this.vy = -Math.random() * 0.5 - 0.2;
    this.baseSize = isEmber ? Math.random() * 2.5 + 1.5 : Math.random() * 1.2 + 0.4;
    this.currentSize = this.baseSize;
    this.color = isEmber ? '#E11D48' : '#333333';
    this.alpha = isEmber ? 0.8 : 0.3;
    this.glow = isEmber;
  }

  update(width: number, height: number, bassEnergy: number) {
    this.x += this.vx;
    this.y += this.vy;
    if (bassEnergy > 0.75) {
      const force = (bassEnergy - 0.7) * 2.5;
      this.vy -= force;
      this.currentSize = this.baseSize * (1 + force * 2);
    } else {
      this.vy = (this.vy * 0.95) + (-0.5 * 0.05);
      this.currentSize = (this.currentSize * 0.9) + (this.baseSize * 0.1);
    }
    if (this.y < -20) { this.y = height + 20; this.x = Math.random() * width; }
    if (this.x < 0) this.x = width;
    if (this.x > width) this.x = 0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.currentSize, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.globalAlpha = this.alpha;
    if (this.glow) { ctx.shadowBlur = 10; ctx.shadowColor = '#E11D48'; }
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0;
  }
}
