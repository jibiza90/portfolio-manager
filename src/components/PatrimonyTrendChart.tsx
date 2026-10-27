import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatCurrency } from '../utils/format';
import './PatrimonyTrendChart.css';

export interface PatrimonyTrendPoint {
  key: string;
  label: string;
  balance: number;
  profit?: number;
  returnPct?: number;
  inflow: number;
  outflow: number;
}

interface PatrimonyTrendChartProps {
  points: PatrimonyTrendPoint[];
  onHoverMonth?: (label: string) => void;
}

const HEIGHT = 440;
const PAD = { top: 46, right: 28, bottom: 86, left: 74 };
const MIN_MONTH_WIDTH = 72;

// Separador de miles siempre (es-ES no lo pone en numeros de 4 cifras).
const groupThousands = (value: number) => {
  const rounded = Math.round(Math.abs(value)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return value < 0 ? `-${rounded}` : rounded;
};
const formatEuro = (value: number) => `${groupThousands(value)} €`;
const formatCompactEuro = (value: number) => {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 2 })} M€`;
  if (Math.abs(value) >= 10_000) return `${(value / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}k €`;
  return formatEuro(value);
};
const formatSignedPct = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const formatSignedEuro = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatEuro(Math.abs(value))}`;

const niceStep = (raw: number) => {
  const power = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * power;
};

// Eje ajustado a los datos (no empieza en 0) para que la evolucion se lea bien.
const buildAxis = (values: number[]) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, Math.abs(max) * 0.08, 1);
  const step = niceStep(span / 4);
  const low = Math.max(0, Math.floor((min - span * 0.12) / step) * step);
  const high = Math.ceil((max + span * 0.18) / step) * step;
  const ticks: number[] = [];
  for (let value = low; value <= high + step / 2; value += step) ticks.push(value);
  return { low, high, ticks };
};

// Curva monotona (Fritsch-Carlson): suave pero sin pasarse de los valores reales.
const monotonePath = (pts: Array<{ x: number; y: number }>) => {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  const n = pts.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(pts[i + 1].x - pts[i].x);
    slope.push((pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x));
  }
  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i += 1) {
    tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  tangent.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i += 1) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tangent[i] = t * a * slope[i];
      tangent[i + 1] = t * b * slope[i];
    }
  }
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i += 1) {
    const third = dx[i] / 3;
    d += ` C${pts[i].x + third},${pts[i].y + tangent[i] * third} ${pts[i + 1].x - third},${pts[i + 1].y - tangent[i + 1] * third} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
};

export const PatrimonyTrendChart: React.FC<PatrimonyTrendChartProps> = ({ points, onHoverMonth }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapWidth, setWrapWidth] = useState(1100);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return undefined;
    const update = () => setWrapWidth(Math.max(320, element.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const width = Math.max(wrapWidth, PAD.left + PAD.right + points.length * MIN_MONTH_WIDTH);

  // En pantallas estrechas el grafico se desliza: empieza mostrando los meses mas recientes.
  useEffect(() => {
    const element = wrapRef.current;
    if (element && width > element.clientWidth) element.scrollLeft = element.scrollWidth;
  }, [points.length, width]);
  const plotW = width - PAD.left - PAD.right;
  const plotBottom = HEIGHT - PAD.bottom;
  const monthWidth = points.length > 0 ? plotW / points.length : plotW;
  const useCompactLabels = monthWidth < 82;

  const model = useMemo(() => {
    if (points.length === 0) return null;
    const axis = buildAxis(points.map((point) => point.balance));
    const y = (value: number) => PAD.top + (1 - (value - axis.low) / Math.max(1, axis.high - axis.low)) * (plotBottom - PAD.top);
    const coords = points.map((point, index) => ({
      ...point,
      x: PAD.left + (index + 0.5) * monthWidth,
      y: y(point.balance),
      change: index > 0 ? point.balance - points[index - 1].balance : undefined
    }));
    // Etiquetas de valor: arriba del punto; si chocan con la anterior, debajo.
    let previous: { left: number; right: number; top: number; bottom: number } | null = null;
    const labels = coords.map((point, index) => {
      const text = useCompactLabels ? formatCompactEuro(point.balance) : formatEuro(point.balance);
      const boxWidth = text.length * 6.6 + 16;
      const isLast = index === coords.length - 1;
      const centerX = Math.min(Math.max(point.x, PAD.left + boxWidth / 2), width - PAD.right - boxWidth / 2);
      let top = point.y - 34;
      let box = { left: centerX - boxWidth / 2, right: centerX + boxWidth / 2, top, bottom: top + 22 };
      const overlaps = (a: typeof box, b: typeof box | null) =>
        !!b && a.left < b.right + 4 && a.right > b.left - 4 && a.top < b.bottom + 2 && a.bottom > b.top - 2;
      if (!isLast && overlaps(box, previous)) {
        top = point.y + 12;
        box = { ...box, top, bottom: top + 22 };
      }
      previous = box;
      return { text, centerX, top, boxWidth, below: top > point.y };
    });
    return { axis, y, coords, labels };
  }, [monthWidth, plotBottom, points, useCompactLabels, width]);

  if (!model) return null;

  const { axis, y, coords, labels } = model;
  const linePath = monotonePath(coords);
  const areaPath = `${linePath} L${coords[coords.length - 1].x},${plotBottom} L${coords[0].x},${plotBottom} Z`;
  const first = coords[0];
  const last = coords[coords.length - 1];
  const periodChange = last.balance - first.balance;
  const maxPoint = coords.reduce((best, point) => (point.balance > best.balance ? point : best), first);
  const active = activeIndex !== null ? coords[activeIndex] : null;
  const isScrollable = width > wrapWidth + 1;

  const handlePointer = (event: React.PointerEvent<SVGRectElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const index = Math.min(coords.length - 1, Math.max(0, Math.floor((x - PAD.left) / monthWidth)));
    if (index !== activeIndex) {
      setActiveIndex(index);
      onHoverMonth?.(coords[index].label);
    }
  };

  return (
    <div className="pm-trend">
      <div className="pm-trend-summary">
        <div>
          <span>Saldo actual</span>
          <strong>{formatCurrency(last.balance)}</strong>
          <small>Cierre {last.label}</small>
        </div>
        <div>
          <span>Variación en el periodo</span>
          <strong className={periodChange >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedEuro(periodChange)}</strong>
          <small>Desde {first.label}{first.balance > 0 ? ` · ${formatSignedPct((periodChange / first.balance) * 100)}` : ''}</small>
        </div>
        <div>
          <span>Máximo del periodo</span>
          <strong>{formatCurrency(maxPoint.balance)}</strong>
          <small>{maxPoint.label}</small>
        </div>
        <div>
          <span>Meses mostrados</span>
          <strong>{coords.length}</strong>
          <small>{first.label} – {last.label}</small>
        </div>
      </div>

      <div ref={wrapRef} className={`pm-trend-scroll${isScrollable ? ' is-scrollable' : ''}`}>
        <div className="pm-trend-stage" style={{ width }}>
          <svg
            className="pm-trend-svg"
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            role="img"
            aria-label={`Evolución del patrimonio de ${first.label} a ${last.label}: de ${formatEuro(first.balance)} a ${formatEuro(last.balance)}`}
          >
            <defs>
              <linearGradient id="pmTrendArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0b8b8f" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#0b8b8f" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="pmTrendLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#185b76" />
                <stop offset="100%" stopColor="#0f9a88" />
              </linearGradient>
            </defs>

            {axis.ticks.map((tick) => (
              <g key={tick}>
                <line className="pm-trend-grid" x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} />
                <text className="pm-trend-axis" x={PAD.left - 12} y={y(tick) + 4} textAnchor="end">
                  {formatCompactEuro(tick)}
                </text>
              </g>
            ))}

            {active ? (
              <rect
                className="pm-trend-column"
                x={active.x - monthWidth / 2}
                y={PAD.top - 20}
                width={monthWidth}
                height={plotBottom - PAD.top + 20}
                rx={10}
              />
            ) : null}

            <path d={areaPath} fill="url(#pmTrendArea)" />
            <path d={linePath} className="pm-trend-line" stroke="url(#pmTrendLine)" />

            {coords.map((point, index) => {
              const label = labels[index];
              const isLast = index === coords.length - 1;
              const isActive = index === activeIndex;
              return (
                <g key={point.key}>
                  {isLast ? <circle className="pm-trend-halo" cx={point.x} cy={point.y} r={12} /> : null}
                  <circle className={`pm-trend-dot${isLast || isActive ? ' is-strong' : ''}`} cx={point.x} cy={point.y} r={isLast || isActive ? 5.5 : 4} />
                  <g className={`pm-trend-label${isLast ? ' is-last' : ''}${label.below ? ' is-below' : ''}`}>
                    <rect x={label.centerX - label.boxWidth / 2} y={label.top} width={label.boxWidth} height={22} rx={11} />
                    <text x={label.centerX} y={label.top + 15} textAnchor="middle">{label.text}</text>
                  </g>
                  <text className="pm-trend-month" x={point.x} y={plotBottom + 24} textAnchor="middle">{point.label}</text>
                  {point.returnPct !== undefined ? (
                    <text
                      className={`pm-trend-return ${point.returnPct >= 0 ? 'is-positive' : 'is-negative'}`}
                      x={point.x}
                      y={plotBottom + 42}
                      textAnchor="middle"
                    >
                      {formatSignedPct(point.returnPct)}
                    </text>
                  ) : null}
                  {point.inflow > 0 || point.outflow > 0 ? (
                    <g className="pm-trend-flows">
                      {point.inflow > 0 ? (
                        <text className="pm-trend-flow is-in" x={point.x} y={plotBottom + 60} textAnchor="middle">
                          ▲ {formatCompactEuro(point.inflow)}
                        </text>
                      ) : null}
                      {point.outflow > 0 ? (
                        <text
                          className="pm-trend-flow is-out"
                          x={point.x}
                          y={plotBottom + (point.inflow > 0 ? 72 : 60)}
                          textAnchor="middle"
                        >
                          ▼ {formatCompactEuro(point.outflow)}
                        </text>
                      ) : null}
                    </g>
                  ) : null}
                </g>
              );
            })}

            <rect
              className="pm-trend-hit"
              x={PAD.left}
              y={PAD.top - 20}
              width={plotW}
              height={plotBottom - PAD.top + 20}
              onPointerMove={handlePointer}
              onPointerDown={handlePointer}
              onPointerLeave={() => setActiveIndex(null)}
            />
          </svg>

          {active ? (
            <div
              className="pm-trend-tooltip"
              style={{
                left: Math.min(Math.max(active.x, 120), width - 120),
                top: Math.max(8, active.y - 150)
              }}
              role="status"
            >
              <strong>{active.label}</strong>
              <div><span>Saldo al cierre</span><b>{formatCurrency(active.balance)}</b></div>
              {active.change !== undefined ? (
                <div><span>Variación vs mes anterior</span><b className={active.change >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedEuro(active.change)}</b></div>
              ) : null}
              {active.profit !== undefined ? (
                <div><span>Beneficio del mes</span><b className={active.profit >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedEuro(active.profit)}</b></div>
              ) : null}
              {active.returnPct !== undefined ? (
                <div><span>Rentabilidad del mes</span><b className={active.returnPct >= 0 ? 'is-positive' : 'is-negative'}>{formatSignedPct(active.returnPct)}</b></div>
              ) : null}
              {active.inflow > 0 ? <div><span>Aportaciones</span><b className="is-positive">{formatSignedEuro(active.inflow)}</b></div> : null}
              {active.outflow > 0 ? <div><span>Retiradas</span><b className="is-negative">{formatSignedEuro(-active.outflow)}</b></div> : null}
            </div>
          ) : null}
        </div>
      </div>
      <p className="pm-trend-footnote">
        Debajo de cada mes: rentabilidad del mes y, si las hubo, ▲ aportaciones y ▼ retiradas.
        {isScrollable ? ' Desliza para ver todos los meses.' : ''}
      </p>
    </div>
  );
};
