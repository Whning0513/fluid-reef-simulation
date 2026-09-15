import { isReefFootprint } from './model.js';

export class WaveField {
  constructor(size = 81) {
    this.size = size;
    this.spacing = 2 / (size - 1);
    this.height = new Float32Array(size * size);
    this.velocity = new Float32Array(size * size);
    this.nextVelocity = new Float32Array(size * size);
    this.reef = new Uint8Array(size * size);
    for (let j = 0; j < size; j += 1) {
      for (let i = 0; i < size; i += 1) {
        const x = -1 + i * this.spacing;
        const y = -1 + j * this.spacing;
        this.reef[j * size + i] = isReefFootprint(x, y) ? 1 : 0;
      }
    }
  }

  reset() {
    this.height.fill(0);
    this.velocity.fill(0);
    this.nextVelocity.fill(0);
  }

  step(dt, sourceVelocity) {
    const n = this.size;
    const h = this.height;
    const v = this.velocity;
    const nv = this.nextVelocity;
    const invDx2 = 1 / (this.spacing * this.spacing);
    const waveSpeed2 = 0.24;

    for (let j = 1; j < n - 1; j += 1) {
      for (let i = 1; i < n - 1; i += 1) {
        const k = j * n + i;
        const lap = (h[k - 1] + h[k + 1] + h[k - n] + h[k + n] - 4 * h[k]) * invDx2;
        const edgeDistance = Math.min(i, j, n - 1 - i, n - 1 - j);
        const edgeDamping = edgeDistance < 8 ? 0.90 + edgeDistance * 0.0115 : 0.994;
        const reefDamping = this.reef[k] ? 0.82 : 1;
        nv[k] = (v[k] + waveSpeed2 * lap * dt) * edgeDamping * reefDamping;

        const x = -1 + i * this.spacing;
        const y = -1 + j * this.spacing;
        const radius2 = x * x + y * y;
        if (radius2 < 0.024) {
          const ring = Math.exp(-Math.pow((Math.sqrt(radius2) - 0.08) / 0.035, 2));
          nv[k] += sourceVelocity * ring * dt * 8.5;
        }
      }
    }

    for (let k = 0; k < h.length; k += 1) {
      v[k] = nv[k];
      h[k] = Math.max(-0.20, Math.min(0.20, h[k] + v[k] * dt));
    }
  }

  peak() {
    let max = 0;
    for (const value of this.height) max = Math.max(max, Math.abs(value));
    return max;
  }
}
