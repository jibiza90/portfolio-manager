import React, { useEffect, useRef } from 'react';
import './MoneyFlowAnimation.css';

// demo1: animacion de como se ha formado el saldo. Un deposito ("Tu cartera") con el capital (azul) y el
// beneficio (verde) que se llena mes a mes; las retiradas fluyen a un segundo deposito ("Ya cobrado").
// Se reproduce sola, se queda unos segundos en el resultado de hoy y vuelve a empezar con un fundido.

export interface MoneyFlowPoint {
  label: string;
  value: number;
  capital: number;
  contributed: number;
  withdrawn: number;
  cobrado: number;
}

interface Props {
  points: MoneyFlowPoint[];
}

const MONTH_MS = 560;
const HOLD_MS = 3800;
const FADE_MS = 650;

const eur = (value: number) => `${Math.round(value).toLocaleString('es-ES')} €`;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ease = (k: number) => 1 - (1 - k) ** 3;

interface Particle { kind: 'in' | 'out'; x: number; y: number; vy: number; s: number; sp: number; alive: boolean }

export const MoneyFlowAnimation: React.FC<Props> = ({ points }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const monthRef = useRef<HTMLDivElement>(null);
  const eventRef = useRef<HTMLDivElement>(null);
  const statRefs = useRef<Array<HTMLElement | null>>([]);
  // Solo se reinicia si cambian los datos, no cada vez que la pagina se vuelve a pintar.
  const pointsKey = JSON.stringify(points);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  useEffect(() => {
    const points = pointsRef.current;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || points.length < 2) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const last = points.length - 1;
    const maxValue = Math.max(1, ...points.map((point) => Math.max(point.value, point.capital))) * 1.12;
    const maxCobrado = Math.max(1, points[last].cobrado) * 1.15;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    let width = 900;
    let height = 380;
    const resize = () => {
      const cssWidth = Math.max(280, wrap.clientWidth);
      width = cssWidth;
      height = cssWidth < 600 ? 330 : 380;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);

    const layout = () => {
      const narrow = width < 600;
      const top = 34;
      const glassH = height - 76;
      const glass = narrow
        ? { x: 18, y: top, w: width * 0.48, h: glassH }
        : { x: width * 0.24, y: top, w: width * 0.26, h: glassH };
      const jarW = narrow ? width * 0.26 : width * 0.15;
      const jarH = glassH * 0.58;
      const jar = narrow
        ? { x: width - jarW - 16, y: top + glassH - jarH, w: jarW, h: jarH }
        : { x: width * 0.7, y: top + glassH - jarH, w: jarW, h: jarH };
      return { glass, jar, narrow };
    };

    let t = reduceMotion ? last : 0;
    let mode: 'play' | 'hold' | 'fadeOut' | 'fadeIn' = reduceMotion ? 'hold' : 'fadeIn';
    let modeTime = 0;
    let alpha = reduceMotion ? 1 : 0;
    let phase = 0;
    let particles: Particle[] = [];
    let lastSegment = -1;
    let frame = 0;
    let previous = 0;
    let visible = true;

    const stateAt = (time: number) => {
      const i = Math.min(last - 1, Math.floor(time));
      const k = Math.min(1, time - i);
      const a = points[i];
      const b = points[i + 1];
      const e = ease(Math.min(1, Math.max(0, (k - 0.1) / 0.8)));
      return {
        i,
        value: lerp(a.value, b.value, e),
        capital: lerp(a.capital, b.capital, e),
        cobrado: lerp(a.cobrado, b.cobrado, e)
      };
    };

    const roundedGlass = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + h - r);
      ctx.quadraticCurveTo(x, y + h, x + r, y + h);
      ctx.lineTo(x + w - r, y + h);
      ctx.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
      ctx.lineTo(x + w, y);
    };

    const liquid = (box: { x: number; y: number; w: number; h: number }, top: number, bottom: number, c1: string, c2: string, ph: number, amp: number) => {
      if (bottom - top < 0.5) return;
      ctx.save();
      roundedGlass(box.x, box.y, box.w, box.h, 22);
      ctx.closePath();
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(box.x, top);
      for (let px = 0; px <= box.w; px += 6) {
        ctx.lineTo(box.x + px, top + Math.sin(px * 0.045 + ph) * amp + Math.sin(px * 0.02 - ph * 0.7) * amp * 0.6);
      }
      ctx.lineTo(box.x + box.w, bottom + 30);
      ctx.lineTo(box.x, bottom + 30);
      ctx.closePath();
      const gradient = ctx.createLinearGradient(0, top, 0, bottom);
      gradient.addColorStop(0, c1);
      gradient.addColorStop(1, c2);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.restore();
    };

    const glassShell = (box: { x: number; y: number; w: number; h: number }, label: string) => {
      ctx.save();
      roundedGlass(box.x, box.y, box.w, box.h, 22);
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(190,225,240,0.35)';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(box.x + 13, box.y + 18);
      ctx.lineTo(box.x + 13, box.y + box.h - 36);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#8fa7b8';
      ctx.font = '500 12px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, box.x + box.w / 2, box.y + box.h + 22);
    };

    const pipePoint = (s: number, from: [number, number], to: [number, number], c1: [number, number], c2: [number, number]) => {
      const u = 1 - s;
      return [
        u * u * u * from[0] + 3 * u * u * s * c1[0] + 3 * u * s * s * c2[0] + s * s * s * to[0],
        u * u * u * from[1] + 3 * u * u * s * c1[1] + 3 * u * s * s * c2[1] + s * s * s * to[1]
      ];
    };

    const centeredLabel = (title: string, amount: string, x: number, y: number, color: string) => {
      ctx.textAlign = 'center';
      ctx.fillStyle = color;
      ctx.font = '600 12px Inter, Arial, sans-serif';
      ctx.fillText(title, x, y - 4);
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 16px Inter, Arial, sans-serif';
      ctx.fillText(amount, x, y + 15);
    };

    const updateTexts = (st: ReturnType<typeof stateAt>, time: number) => {
      const current = points[Math.min(last, Math.round(time))];
      if (monthRef.current) monthRef.current.textContent = current.label;
      const next = points[Math.min(last, st.i + 1)];
      const prev = points[st.i];
      let text: string;
      if (time >= last - 0.001) {
        text = `<b class="is-today">Hoy:</b> ${eur(points[last].capital)} de tu capital + ${eur(points[last].value - points[last].capital)} de beneficio`;
      } else if (next.contributed > 0) {
        text = `<b class="is-in">Aportas ${eur(next.contributed)}</b>`;
      } else if (next.withdrawn > 0) {
        text = `<b class="is-out">Retiras ${eur(next.withdrawn)}</b>${next.capital === 0 && prev.capital > 0 ? ' · recuperas todo tu capital' : ''}`;
      } else {
        const gain = next.value - prev.value;
        text = gain >= 0
          ? `<b class="is-gain">Tu inversión gana ${eur(gain)}</b> este mes`
          : `<b class="is-loss">Tu inversión baja ${eur(Math.abs(gain))}</b> este mes`;
      }
      if (eventRef.current) eventRef.current.innerHTML = text;
      const values = [st.value, st.capital, st.value - st.capital, st.cobrado];
      values.forEach((value, index) => {
        const element = statRefs.current[index];
        if (element) element.textContent = eur(value);
      });
    };

    const draw = () => {
      const { glass, jar, narrow } = layout();
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = alpha;
      const st = stateAt(t);
      if (mode === 'play' && st.i !== lastSegment) {
        lastSegment = st.i;
        const next = points[st.i + 1];
        if (next.contributed > 0) {
          for (let n = 0; n < 55; n += 1) {
            particles.push({ kind: 'in', x: glass.x + 24 + Math.random() * (glass.w - 48), y: -10 - Math.random() * 110, vy: 2 + Math.random() * 2, s: 0, sp: 0, alive: true });
          }
        }
        if (next.withdrawn > 0) {
          for (let n = 0; n < 65; n += 1) {
            particles.push({ kind: 'out', x: 0, y: 0, vy: 0, s: -Math.random() * 0.8, sp: 0.016 + Math.random() * 0.008, alive: true });
          }
        }
      }

      const base = glass.y + glass.h;
      const capitalTop = base - glass.h * Math.max(0, st.capital) / maxValue;
      const valueTop = base - glass.h * Math.max(0, st.value) / maxValue;
      const profitTop = Math.min(valueTop, capitalTop);

      // Tubo hacia "Ya cobrado".
      const from: [number, number] = [glass.x + glass.w + 6, glass.y + 34];
      const to: [number, number] = [jar.x + jar.w / 2, jar.y - 10];
      const c1: [number, number] = [from[0] + (to[0] - from[0]) * 0.45, glass.y - 18];
      const c2: [number, number] = [to[0] - (to[0] - from[0]) * 0.2, glass.y - 4];
      ctx.save();
      ctx.strokeStyle = 'rgba(190,225,240,0.16)';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(from[0], from[1]);
      ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], to[0], to[1]);
      ctx.stroke();
      ctx.restore();

      glassShell(glass, 'Tu cartera');
      glassShell(jar, 'Ya cobrado');
      liquid(glass, profitTop, capitalTop, 'rgba(63,208,154,0.95)', 'rgba(31,150,120,0.85)', phase, 4);
      liquid(glass, capitalTop, base, 'rgba(79,140,255,0.95)', 'rgba(40,80,190,0.95)', phase * 1.3 + 1, st.capital > 0 ? 2.5 : 0);
      const jarTop = jar.y + jar.h - jar.h * st.cobrado / maxCobrado;
      liquid(jar, jarTop, jar.y + jar.h, 'rgba(245,178,92,0.95)', 'rgba(214,120,40,0.95)', phase * 0.9, 2.5);

      particles = particles.filter((particle) => particle.alive);
      particles.forEach((particle) => {
        if (particle.kind === 'in') {
          particle.y += particle.vy;
          particle.vy += 0.08;
          if (particle.y > profitTop) particle.alive = false;
          ctx.fillStyle = 'rgba(124,180,255,0.9)';
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          particle.s += particle.sp;
          if (particle.s > 1) { particle.alive = false; return; }
          if (particle.s < 0) return;
          const [px, py] = pipePoint(particle.s, from, to, c1, c2);
          ctx.fillStyle = 'rgba(245,178,92,0.95)';
          ctx.beginPath();
          ctx.arc(px, py, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      const midX = glass.x + glass.w / 2;
      if (capitalTop - profitTop > 40) centeredLabel('Beneficio', eur(st.value - st.capital), midX, (profitTop + capitalTop) / 2, '#c9f5e5');
      if (base - capitalTop > 40) centeredLabel('Tu capital', eur(st.capital), midX, (capitalTop + base) / 2, '#d6e5ff');
      if (st.cobrado > 0 && jar.y + jar.h - jarTop > 34) {
        centeredLabel('', eur(st.cobrado), jar.x + jar.w / 2, (jarTop + jar.y + jar.h) / 2, '#ffe7c4');
      }
      if (!narrow) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 20px Inter, Arial, sans-serif';
        ctx.fillText(eur(st.value), glass.x - 16, Math.max(glass.y + 16, valueTop + 7));
        ctx.fillStyle = '#8fa7b8';
        ctx.font = '12px Inter, Arial, sans-serif';
        ctx.fillText('valor', glass.x - 16, Math.max(glass.y + 34, valueTop + 25));
      }
      ctx.globalAlpha = 1;
      updateTexts(st, t);
    };

    const loop = (timestamp: number) => {
      const dt = previous ? Math.min(60, timestamp - previous) : 16;
      previous = timestamp;
      phase += dt * 0.003;
      modeTime += dt;
      if (mode === 'fadeIn') {
        alpha = Math.min(1, modeTime / FADE_MS);
        if (alpha >= 1) { mode = 'play'; modeTime = 0; }
      } else if (mode === 'play') {
        t = Math.min(last, t + dt / MONTH_MS);
        if (t >= last) { mode = 'hold'; modeTime = 0; }
      } else if (mode === 'hold') {
        if (!reduceMotion && modeTime > HOLD_MS) { mode = 'fadeOut'; modeTime = 0; }
      } else if (mode === 'fadeOut') {
        alpha = Math.max(0, 1 - modeTime / FADE_MS);
        if (alpha <= 0) {
          t = 0;
          particles = [];
          lastSegment = -1;
          mode = 'fadeIn';
          modeTime = 0;
        }
      }
      draw();
      if (visible && !reduceMotion) frame = window.requestAnimationFrame(loop);
    };

    // Solo se anima cuando se ve en pantalla.
    const visibility = new IntersectionObserver(([entry]) => {
      const nowVisible = entry.isIntersecting;
      if (nowVisible && !visible) {
        visible = true;
        previous = 0;
        frame = window.requestAnimationFrame(loop);
      } else if (!nowVisible) {
        visible = false;
        window.cancelAnimationFrame(frame);
      }
    });
    visibility.observe(wrap);

    if (reduceMotion) draw();
    else frame = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
    };
  }, [pointsKey]);

  const final = points[points.length - 1];
  return (
    <section className="report-pro-panel mfa-panel" aria-label="Cómo se ha formado tu saldo">
      <div className="mfa">
        <div className="mfa-head">
          <div>
            <div className="mfa-eyebrow">Cómo se ha formado tu saldo</div>
            <div className="mfa-month" ref={monthRef}>{final?.label}</div>
            <div className="mfa-event" ref={eventRef} aria-live="off" />
          </div>
          <div className="mfa-stats">
            {[
              ['Valor', '#5fd3c4', final?.value ?? 0],
              ['Tu capital', '#4f8cff', final?.capital ?? 0],
              ['Beneficio', '#3fd09a', (final?.value ?? 0) - (final?.capital ?? 0)],
              ['Ya cobrado', '#f5b25c', final?.cobrado ?? 0]
            ].map(([label, color, value], index) => (
              <div className="mfa-stat" key={label as string}>
                <small><i style={{ background: color as string }} />{label}</small>
                <b ref={(element) => { statRefs.current[index] = element; }}>{eur(value as number)}</b>
              </div>
            ))}
          </div>
        </div>
        <div ref={wrapRef} className="mfa-canvas">
          <canvas ref={canvasRef} role="img" aria-label={`Tu cartera hoy: ${eur(final?.capital ?? 0)} de tu capital y ${eur((final?.value ?? 0) - (final?.capital ?? 0))} de beneficio. Ya cobrado: ${eur(final?.cobrado ?? 0)}.`} />
        </div>
      </div>
    </section>
  );
};
