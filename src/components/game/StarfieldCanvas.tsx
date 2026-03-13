"use client";

import { useEffect, useMemo, useRef } from "react";

type Star = {
  x: number;          // normalized 0-1
  y: number;
  r: number;          // pixel radius
  layer: number;      // 0=far 1=mid 2=near
  twinklePhase: number;
  twinkleSpeed: number;
};

// Seeded deterministic random so stars never move between renders
function seededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = s ^ (s >>> 16);
    return (s >>> 0) / 0xffffffff;
  };
}

function buildStars(): Star[] {
  const rand = seededRng(0xdeadbeef);
  const out: Star[] = [];

  // Layer 0 – distant, tiny, slow parallax (200 stars)
  for (let i = 0; i < 200; i++) {
    out.push({ x: rand(), y: rand(), r: 0.35 + rand() * 0.55, layer: 0,
      twinklePhase: rand() * Math.PI * 2, twinkleSpeed: 0.00025 + rand() * 0.0006 });
  }
  // Layer 1 – mid (90 stars)
  for (let i = 0; i < 90; i++) {
    out.push({ x: rand(), y: rand(), r: 0.7 + rand() * 0.9, layer: 1,
      twinklePhase: rand() * Math.PI * 2, twinkleSpeed: 0.0005 + rand() * 0.001 });
  }
  // Layer 2 – close, large, fast parallax (35 stars)
  for (let i = 0; i < 35; i++) {
    out.push({ x: rand(), y: rand(), r: 1.2 + rand() * 1.4, layer: 2,
      twinklePhase: rand() * Math.PI * 2, twinkleSpeed: 0.0008 + rand() * 0.0016 });
  }

  return out;
}

// Parallax multiplier per layer
const PARALLAX = [0.035, 0.09, 0.18];

// Fixed nebula clouds (normalized coords + color)
const NEBULAS = [
  { x: 0.18, y: 0.28, r: 0.30, color: [40, 60, 160] as [number,number,number], a: 0.055 },
  { x: 0.78, y: 0.55, r: 0.28, color: [80, 30, 130] as [number,number,number], a: 0.05  },
  { x: 0.50, y: 0.82, r: 0.22, color: [20, 70, 120] as [number,number,number], a: 0.04  },
  { x: 0.62, y: 0.15, r: 0.18, color: [60, 40, 150] as [number,number,number], a: 0.04  },
];

type Props = {
  pan: { x: number; y: number };
};

export function StarfieldCanvas({ pan }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stars = useMemo(() => buildStars(), []);
  const rafRef = useRef(0);
  const panRef = useRef(pan);

  useEffect(() => { panRef.current = pan; }, [pan]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (now: number) => {
      const { width, height } = canvas;
      const px = panRef.current.x;
      const py = panRef.current.y;

      // Deep space base
      ctx.fillStyle = "#020610";
      ctx.fillRect(0, 0, width, height);

      // Nebula glow patches (very slow parallax 0.02)
      for (const neb of NEBULAS) {
        const nx = ((neb.x * width + px * 0.02) % width + width) % width;
        const ny = ((neb.y * height + py * 0.02) % height + height) % height;
        const nr = Math.min(width, height) * neb.r;
        const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
        const [r, gr, b] = neb.color;
        g.addColorStop(0, `rgba(${r},${gr},${b},${neb.a})`);
        g.addColorStop(1, `rgba(${r},${gr},${b},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
      }

      // Stars
      for (const star of stars) {
        const p = PARALLAX[star.layer];
        const sx = ((star.x * width  + px * p) % width  + width)  % width;
        const sy = ((star.y * height + py * p) % height + height) % height;

        const twinkle = 0.5 + 0.5 * Math.sin(star.twinklePhase + now * star.twinkleSpeed);
        const alpha = (0.4 + star.layer * 0.25) * (0.6 + 0.4 * twinkle);

        // Slight warm/cool tint per layer
        const base = 170 + star.layer * 22;
        const blue = base + 28;
        ctx.beginPath();
        ctx.arc(sx, sy, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${base},${base + 5},${blue},${alpha.toFixed(3)})`;
        ctx.fill();

        // Bright core on larger stars
        if (star.r > 1.4 && twinkle > 0.7) {
          ctx.beginPath();
          ctx.arc(sx, sy, star.r * 0.38, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${(twinkle * 0.55).toFixed(3)})`;
          ctx.fill();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [stars]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}
