// Трёхмерный предпросмотр скина на CSS 3D: игрок собирается из кубов, грани берут куски текстуры.
// Не требует WebGL и внешних библиотек; вращение мышью или пальцем.
const K = 7; // пикселей экрана на пиксель текстуры

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
    img.src = src;
  });
}

// Куб размером w×h×d с развёрткой от точки (u, v), как в текстурах Minecraft.
function cube({ w, h, d, u, v, tex, texW, texH, grow = 0, mirror = false, pos = [0, 0, 0], pivot = null, rot = '' }) {
  const W = w + grow * 2;
  const H = h + grow * 2;
  const D = d + grow * 2;
  const el = document.createElement('div');
  el.className = 'p3-cube';
  const [x, y, z] = pos;
  el.style.cssText = `width:${W * K}px;height:${H * K}px;margin:${-(H * K) / 2}px 0 0 ${-(W * K) / 2}px;transform:translate3d(${x * K}px,${y * K}px,${z * K}px)`;
  const face = (fw, fh, ou, ov, transform, flip) => {
    const f = document.createElement('div');
    f.className = 'p3-face';
    f.style.cssText = `width:${fw * K}px;height:${fh * K}px;margin:${-(fh * K) / 2}px 0 0 ${-(fw * K) / 2}px;background-image:url("${tex}");background-size:${texW * K}px ${texH * K}px;background-position:${-ou * K}px ${-ov * K}px;transform:${transform}${flip ? ' scaleX(-1)' : ''}`;
    el.appendChild(f);
  };
  const m = mirror;
  face(w, h, u + d, v + d, `translateZ(${(D * K) / 2}px)`, m); // спереди
  face(w, h, u + 2 * d + w, v + d, `rotateY(180deg) translateZ(${(D * K) / 2}px)`, m); // сзади
  face(d, h, m ? u + d + w : u, v + d, `rotateY(-90deg) translateZ(${(W * K) / 2}px)`, m); // правая сторона персонажа
  face(d, h, m ? u : u + d + w, v + d, `rotateY(90deg) translateZ(${(W * K) / 2}px)`, m); // левая
  face(w, d, u + d, v, `rotateX(90deg) translateZ(${(H * K) / 2}px)`, m); // верх
  face(w, d, u + d + w, v, `rotateX(-90deg) translateZ(${(H * K) / 2}px)`, m); // низ
  el.style.transformStyle = 'preserve-3d';
  if (pivot) {
    // вращение вокруг верхней точки (для плаща)
    el.style.transformOrigin = '50% 0';
    el.style.transform += ` ${rot}`;
  }
  return el;
}

export function createViewer(mount, { lowPower = false } = {}) {
  mount.classList.add('p3');
  mount.innerHTML = '<div class="p3-scene"><div class="p3-player"></div></div><div class="p3-shadow"></div>';
  const player = mount.querySelector('.p3-player');
  let angle = -28;
  let tilt = -6;
  let auto = !lowPower;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let raf = 0;
  let current = { skin: null, slim: false, cape: null, showCape: true };

  const apply = () => {
    player.style.transform = `rotateX(${tilt}deg) rotateY(${angle}deg)`;
  };
  const tick = () => {
    if (!mount.isConnected) return;
    if (auto && !dragging) {
      angle += 0.5;
      apply();
    }
    raf = requestAnimationFrame(tick);
  };

  async function build() {
    player.innerHTML = '';
    if (!current.skin) return;
    let img;
    try {
      img = await loadImage(current.skin);
    } catch {
      return;
    }
    const legacy = img.height === 32;
    const slim = current.slim;
    const arm = slim ? 3 : 4;
    const base = { tex: current.skin, texW: img.width, texH: img.height };
    const parts = [];
    // [w, h, d, u, v, x, y, z, глубина оверлея, зеркало]
    parts.push({ w: 8, h: 8, d: 8, u: 0, v: 0, pos: [0, -14, 0], over: [32, 0] });
    parts.push({ w: 8, h: 12, d: 4, u: 16, v: 16, pos: [0, -4, 0], over: [16, 32] });
    parts.push({ w: arm, h: 12, d: 4, u: 40, v: 16, pos: [-(4 + arm / 2), -4, 0], over: [40, 32] });
    parts.push({ w: 4, h: 12, d: 4, u: 0, v: 16, pos: [-2, 8, 0], over: [0, 32] });
    if (legacy) {
      parts.push({ w: arm, h: 12, d: 4, u: 40, v: 16, pos: [4 + arm / 2, -4, 0], mirror: true });
      parts.push({ w: 4, h: 12, d: 4, u: 0, v: 16, pos: [2, 8, 0], mirror: true });
    } else {
      parts.push({ w: arm, h: 12, d: 4, u: 32, v: 48, pos: [4 + arm / 2, -4, 0], over: [48, 48] });
      parts.push({ w: 4, h: 12, d: 4, u: 16, v: 48, pos: [2, 8, 0], over: [0, 48] });
    }
    for (const p of parts) {
      player.appendChild(cube({ ...base, ...p }));
      if (p.over && (!legacy || (p.u === 0 && p.v === 0))) {
        // оверлей: у головы он есть и в старых скинах
        player.appendChild(cube({ ...base, ...p, u: p.over[0], v: p.over[1], grow: 0.5 }));
      }
    }
    if (current.cape && current.showCape) {
      try {
        const cimg = await loadImage(current.cape);
        const cs = Math.max(1, cimg.width / 64);
        const capeEl = cube({ tex: current.cape, texW: cimg.width / cs, texH: cimg.height / cs, w: 10, h: 16, d: 1, u: 0, v: 0, pos: [0, -4, -2.75], pivot: true, rot: 'rotateY(180deg) rotateX(-6deg)' });
        player.appendChild(capeEl);
      } catch {
        /* плащ не загрузился: показываем без него */
      }
    }
    apply();
  }

  const down = (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    mount.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    if (!dragging) return;
    angle += (e.clientX - lastX) * 0.8;
    tilt = Math.max(-40, Math.min(30, tilt - (e.clientY - lastY) * 0.4));
    lastX = e.clientX;
    lastY = e.clientY;
    apply();
  };
  const up = () => (dragging = false);
  mount.addEventListener('pointerdown', down);
  mount.addEventListener('pointermove', move);
  mount.addEventListener('pointerup', up);
  mount.addEventListener('pointercancel', up);
  apply();
  raf = requestAnimationFrame(tick);

  return {
    set(patch) {
      current = { ...current, ...patch };
      return build();
    },
    face(side) {
      angle = side === 'back' ? 180 : 0;
      tilt = -4;
      auto = false;
      apply();
    },
    setAuto(v) {
      auto = !!v;
    },
    isAuto: () => auto,
    destroy() {
      cancelAnimationFrame(raf);
    },
  };
}
