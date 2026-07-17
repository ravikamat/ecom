export class DiscoveryStreamRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.products = new Map();
    this.connections = [];
    this.animationId = null;
    this.hoveredProduct = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    canvas.addEventListener('click', (e) => this.handleClick(e));
  }

  resize() {
    this.canvas.width = this.canvas.parentElement.clientWidth;
    this.canvas.height = this.canvas.parentElement.clientHeight;
  }

  getCategoryColor(category) {
    const colors = {
      electronics: '#00d4ff',
      fashion: '#ff6b9d',
      home: '#7ee787',
      beauty: '#d4a5ff',
      sports: '#ffd93d',
      default: '#a0a0a0',
    };
    return colors[category?.toLowerCase()] || colors.default;
  }

  addProduct(product) {
    const particle = {
      id: product.id,
      x: Math.random() * (this.canvas.width - 100) + 50,
      y: -30,
      vy: 0.5 + Math.random() * 1.5,
      vx: (Math.random() - 0.5) * 0.5,
      color: this.getCategoryColor(product.category),
      radius: 4 + (product.confidence || 0.5) * 8,
      data: product,
      opacity: 0,
      targetOpacity: 0.8 + (product.confidence || 0.5) * 0.2,
      pulsePhase: Math.random() * Math.PI * 2,
    };

    this.particles.push(particle);
    this.products.set(product.id, particle);

    this.particles.forEach(other => {
      if (other.id !== product.id && other.data.category === product.category) {
        this.connections.push({
          from: particle,
          to: other,
          strength: 0.1 + (product.confidence || 0.5) * 0.3,
        });
      }
    });
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let closest = null;
    let closestDist = Infinity;

    this.particles.forEach(p => {
      const dist = Math.hypot(p.x - x, p.y - y);
      if (dist < p.radius + 10 && dist < closestDist) {
        closest = p;
        closestDist = dist;
      }
    });

    this.hoveredProduct = closest;
    this.canvas.style.cursor = closest ? 'pointer' : 'default';
  }

  handleClick(e) {
    if (this.hoveredProduct) {
      const event = new CustomEvent('productSelected', {
        detail: this.hoveredProduct.data,
      });
      this.canvas.dispatchEvent(event);
    }
  }

  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.connections.forEach(conn => {
      const dist = Math.hypot(conn.from.x - conn.to.x, conn.from.y - conn.to.y);
      if (dist < 150) {
        this.ctx.beginPath();
        this.ctx.moveTo(conn.from.x, conn.from.y);
        this.ctx.lineTo(conn.to.x, conn.to.y);
        this.ctx.strokeStyle = `rgba(255,255,255,${conn.strength * (1 - dist / 150)})`;
        this.ctx.lineWidth = 0.5;
        this.ctx.stroke();
      }
    });

    this.particles.forEach(p => {
      p.y += p.vy;
      p.x += p.vx;
      p.pulsePhase += 0.02;

      if (p.opacity < p.targetOpacity) {
        p.opacity += 0.02;
      }

      const pulse = p === this.hoveredProduct ? Math.sin(p.pulsePhase) * 3 : 0;
      const radius = p.radius + pulse;

      const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 2);
      gradient.addColorStop(0, p.color + Math.floor(p.opacity * 255).toString(16).padStart(2, '0'));
      gradient.addColorStop(1, 'transparent');

      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, radius * 2, 0, Math.PI * 2);
      this.ctx.fillStyle = gradient;
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.opacity;
      this.ctx.fill();
      this.ctx.globalAlpha = 1;

      if (p === this.hoveredProduct) {
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '12px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(p.data.name?.substring(0, 20) || 'Unknown', p.x, p.y - radius - 8);
        this.ctx.fillText(`$${p.data.avg_price || 'N/A'} | ${p.data.category || ''}`, p.x, p.y - radius - 20);
      }

      if (p.y > this.canvas.height + 50) {
        const idx = this.particles.indexOf(p);
        if (idx > -1) this.particles.splice(idx, 1);
        this.products.delete(p.id);
        this.connections = this.connections.filter(c => c.from !== p && c.to !== p);
      }
    });

    this.animationId = requestAnimationFrame(() => this.render());
  }

  start() {
    if (!this.animationId) {
      this.render();
    }
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', () => this.resize());
  }
}
