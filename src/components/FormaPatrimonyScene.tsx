import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { formatCurrency } from '../utils/format';

export type FormaLens = 'composition' | 'trajectory' | 'movements';

export interface FormaMonthNode {
  key: string;
  label: string;
  shortLabel: string;
  balance: number;
  netCapital: number;
  profit: number;
  returnPct: number;
  increments: number;
  decrements: number;
  isPending?: boolean;
}

interface FormaPatrimonySceneProps {
  months: FormaMonthNode[];
  activeIndex: number;
  lens: FormaLens;
  reducedMotion: boolean;
  onSelect: (index: number, source: string) => void;
}

interface HoverState {
  index: number;
  x: number;
  y: number;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

const signedMoney = (value: number) => {
  if (Math.abs(value) < 0.005) return formatCurrency(0);
  return `${value > 0 ? '+' : '-'}${formatCurrency(Math.abs(value))}`;
};

const signedPercent = (value: number) => {
  if (Math.abs(value) < 0.005) return '0,00 %';
  return `${value > 0 ? '+' : '-'}${Math.abs(value).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} %`;
};

const compactCurrency = (value: number) => {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} M EUR`;
  if (absolute >= 1_000) return `${Math.round(value / 1_000).toLocaleString('es-ES')}k EUR`;
  return `${Math.round(value).toLocaleString('es-ES')} EUR`;
};

const buildScale = (months: FormaMonthNode[]) => {
  const values = months.flatMap((month) => [month.balance, month.netCapital]);
  const rawMaximum = Math.max(1, ...values);
  const rawMinimum = Math.min(0, ...values);
  const padding = Math.max(1, (rawMaximum - rawMinimum) * 0.12);
  const minimum = Math.max(0, rawMinimum - padding * 0.25);
  const maximum = rawMaximum + padding;
  const range = Math.max(1, maximum - minimum);
  return { minimum, maximum, range };
};

const makeChartGeometry = (months: FormaMonthNode[], width: number, height: number) => {
  const scale = buildScale(months);
  const left = 84;
  const right = 34;
  const top = 36;
  const bottom = 36;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xFor = (index: number) => left + (months.length === 1 ? plotWidth / 2 : (index / (months.length - 1)) * plotWidth);
  const yFor = (value: number) => top + ((scale.maximum - value) / scale.range) * plotHeight;
  const wealthPath = months.map((month, index) => `${index ? 'L' : 'M'} ${xFor(index)} ${yFor(month.balance)}`).join(' ');
  const capitalPath = months.map((month, index) => `${index ? 'L' : 'M'} ${xFor(index)} ${yFor(month.netCapital)}`).join(' ');
  const resultArea = `${wealthPath} ${months.slice().reverse().map((month, reverseIndex) => {
    const index = months.length - 1 - reverseIndex;
    return `L ${xFor(index)} ${yFor(month.netCapital)}`;
  }).join(' ')} Z`;
  return { ...scale, left, right, top, bottom, plotWidth, plotHeight, xFor, yFor, wealthPath, capitalPath, resultArea };
};

const FormaFallback: React.FC<FormaPatrimonySceneProps> = ({ months, activeIndex, lens, onSelect }) => {
  const width = 1280;
  const height = 610;
  const chart = makeChartGeometry(months, width, height);

  return (
    <div className="forma-scene-fallback" data-renderer="svg-compatible">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trayectoria patrimonial interactiva en modo compatible">
        <defs>
          <linearGradient id="forma-result-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b99858" stopOpacity="0.42" />
            <stop offset="1" stopColor="#b99858" stopOpacity="0.04" />
          </linearGradient>
          <filter id="forma-path-glow" x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = chart.top + tick * chart.plotHeight;
          const value = chart.maximum - tick * chart.range;
          return (
            <g key={tick}>
              <line x1={chart.left} x2={width - chart.right} y1={y} y2={y} className="forma-fallback-grid" />
              <text x={chart.left - 14} y={y + 5} textAnchor="end" className="forma-fallback-axis-label">{compactCurrency(value)}</text>
            </g>
          );
        })}
        {lens !== 'movements' ? <path d={chart.resultArea} fill="url(#forma-result-fill)" opacity={lens === 'composition' ? 1 : 0.36} /> : null}
        <path d={chart.capitalPath} className="forma-fallback-capital" opacity={lens === 'movements' ? 0.22 : 1} />
        <path d={chart.wealthPath} className="forma-fallback-wealth" filter="url(#forma-path-glow)" opacity={lens === 'movements' ? 0.28 : 1} />
        {months.map((month, index) => {
          const x = chart.xFor(index);
          const wealthY = chart.yFor(month.balance);
          const capitalY = chart.yFor(month.netCapital);
          const isActive = index === activeIndex;
          const movement = month.increments > 0 || month.decrements > 0 || month.isPending;
          return (
            <g key={month.key} className={`${isActive ? 'is-active' : ''}${lens === 'movements' && !movement ? ' is-muted' : ''}`}>
              {isActive ? <rect x={x - 16} y={chart.top - 12} width="32" height={chart.plotHeight + 24} rx="16" className="forma-fallback-focus" /> : null}
              <line x1={x} x2={x} y1={wealthY} y2={capitalY} className="forma-fallback-result-span" />
              <circle cx={x} cy={capitalY} r={isActive ? 7 : 4.5} className="forma-fallback-capital-node" />
              <circle cx={x} cy={wealthY} r={isActive ? 11 : 6.5} className="forma-fallback-node" />
              {month.increments > 0 ? <path d={`M ${x - 13} ${wealthY + 26} L ${x - 13} ${wealthY + 8} l -6 7 m 6 -7 l 6 7`} className="forma-fallback-in" /> : null}
              {month.decrements > 0 ? <path d={`M ${x + 13} ${wealthY + 8} L ${x + 13} ${wealthY + 26} l -6 -7 m 6 7 l 6 -7`} className="forma-fallback-out" /> : null}
            </g>
          );
        })}
      </svg>
      <div className="forma-fallback-hits" style={{ '--forma-count': months.length } as React.CSSProperties}>
        {months.map((month, index) => (
          <button
            key={month.key}
            type="button"
            className={index === activeIndex ? 'is-active' : ''}
            aria-label={`Ver ${month.label}`}
            onClick={() => onSelect(index, 'fallback')}
          />
        ))}
      </div>
      <span className="forma-compatible-note">Modo compatible · todos los periodos y cifras siguen disponibles</span>
    </div>
  );
};

export const FormaPatrimonyScene: React.FC<FormaPatrimonySceneProps> = (props) => {
  const { months, activeIndex, lens, reducedMotion, onSelect } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeIndexRef = useRef(activeIndex);
  const lensRef = useRef(lens);
  const onSelectRef = useRef(onSelect);
  const zoomRef = useRef(100);
  const [rendererState, setRendererState] = useState<'checking' | 'webgl' | 'fallback'>('checking');
  const [hover, setHover] = useState<HoverState | null>(null);
  const [zoom, setZoom] = useState(100);
  const hoveredMonth = hover ? months[hover.index] : null;
  const scale = useMemo(() => buildScale(months), [months]);
  const tickValues = useMemo(() => Array.from({ length: 5 }, (_, index) => scale.maximum - (scale.range * index) / 4), [scale]);

  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);
  useEffect(() => { lensRef.current = lens; }, [lens]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas || !months.length) return undefined;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setRendererState('fallback');
      return undefined;
    }

    setRendererState('webgl');
    const highDensity = (window.devicePixelRatio || 1) > 1.8;
    renderer.setPixelRatio(highDensity ? 1 : Math.min(window.devicePixelRatio || 1, 1.35));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-7, 7, 3.7, -3.7, 0.1, 40);
    camera.position.set(0, 0, 12);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x36504d, 2.8));
    const keyLight = new THREE.DirectionalLight(0xfff8e8, 4.6);
    keyLight.position.set(-5, 8, 10);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x7ec6b7, 15, 26, 2);
    rimLight.position.set(6, 2, 7);
    scene.add(rimLight);

    const world = new THREE.Group();
    scene.add(world);

    const chartWidth = 12.8;
    const chartHeight = 5.65;
    const chartBottom = -2.72;
    const xFor = (index: number) => months.length === 1 ? 0 : -chartWidth / 2 + (index / (months.length - 1)) * chartWidth;
    const yFor = (value: number) => chartBottom + ((value - scale.minimum) / scale.range) * chartHeight;

    const panelMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xf5f2e9,
      roughness: 0.82,
      metalness: 0.02,
      transparent: true,
      opacity: 0.72,
      transmission: 0.08
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(14.2, 6.9), panelMaterial);
    panel.position.z = -1.25;
    world.add(panel);

    const gridMaterial = new THREE.MeshBasicMaterial({ color: 0x365a55, transparent: true, opacity: 0.11 });
    for (let index = 0; index < 5; index += 1) {
      const grid = new THREE.Mesh(new THREE.BoxGeometry(chartWidth, 0.012, 0.012), gridMaterial.clone());
      grid.position.set(0, chartBottom + (chartHeight * index) / 4, -0.7);
      world.add(grid);
    }

    const wealthPoints = months.map((month, index) => new THREE.Vector3(xFor(index), yFor(month.balance), 0.34));
    const capitalPoints = months.map((month, index) => new THREE.Vector3(xFor(index), yFor(month.netCapital), -0.15));
    const wealthCurve = new THREE.CatmullRomCurve3(wealthPoints, false, 'catmullrom', 0.08);
    const capitalCurve = new THREE.CatmullRomCurve3(capitalPoints, false, 'catmullrom', 0.08);

    const wealthGlowMaterial = new THREE.MeshBasicMaterial({ color: 0x1b786d, transparent: true, opacity: 0.13 });
    const wealthMaterial = new THREE.MeshPhysicalMaterial({ color: 0x17665e, roughness: 0.24, metalness: 0.2, clearcoat: 0.88, clearcoatRoughness: 0.16 });
    const capitalMaterial = new THREE.MeshPhysicalMaterial({ color: 0x263f3d, roughness: 0.42, metalness: 0.12, clearcoat: 0.38 });
    const resultMaterial = new THREE.MeshPhysicalMaterial({ color: 0xc0a05e, roughness: 0.22, metalness: 0.12, transparent: true, opacity: 0.28, transmission: 0.18, side: THREE.DoubleSide });
    const movementInMaterial = new THREE.MeshPhysicalMaterial({ color: 0xb28d48, roughness: 0.3, metalness: 0.38, emissive: 0x4e3712, emissiveIntensity: 0.2 });
    const movementOutMaterial = new THREE.MeshPhysicalMaterial({ color: 0xb8655e, roughness: 0.36, metalness: 0.14, emissive: 0x5b1e1a, emissiveIntensity: 0.18 });
    const pendingMaterial = new THREE.MeshPhysicalMaterial({ color: 0x759c94, roughness: 0.28, wireframe: true, transparent: true, opacity: 0.8 });

    const wealthGlow = new THREE.Mesh(new THREE.TubeGeometry(wealthCurve, Math.max(48, months.length * 12), 0.15, 8, false), wealthGlowMaterial);
    wealthGlow.userData.layer = 'trajectory';
    world.add(wealthGlow);
    const wealthPath = new THREE.Mesh(new THREE.TubeGeometry(wealthCurve, Math.max(48, months.length * 12), 0.055, 10, false), wealthMaterial);
    wealthPath.userData.layer = 'trajectory';
    world.add(wealthPath);
    const capitalPath = new THREE.Mesh(new THREE.TubeGeometry(capitalCurve, Math.max(48, months.length * 12), 0.034, 8, false), capitalMaterial);
    capitalPath.userData.layer = 'capital';
    world.add(capitalPath);

    const resultMeshes: THREE.Mesh[] = [];
    for (let index = 0; index < months.length - 1; index += 1) {
      const aWealth = wealthPoints[index];
      const bWealth = wealthPoints[index + 1];
      const aCapital = capitalPoints[index];
      const bCapital = capitalPoints[index + 1];
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        aWealth.x, aWealth.y, 0,
        bWealth.x, bWealth.y, 0,
        bCapital.x, bCapital.y, 0,
        aWealth.x, aWealth.y, 0,
        bCapital.x, bCapital.y, 0,
        aCapital.x, aCapital.y, 0
      ], 3));
      geometry.computeVertexNormals();
      const result = new THREE.Mesh(geometry, resultMaterial.clone());
      result.userData.layer = 'result';
      resultMeshes.push(result);
      world.add(result);
    }

    const focusMaterial = new THREE.MeshBasicMaterial({ color: 0xc5a45f, transparent: true, opacity: 0.13, depthWrite: false });
    const focus = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 6.15), focusMaterial);
    focus.position.set(xFor(activeIndex), 0, -0.48);
    world.add(focus);

    const hitTargets: THREE.Object3D[] = [];
    const nodeGroups: THREE.Group[] = [];
    const movementGroups: THREE.Group[] = [];
    const nodeGeometry = new THREE.SphereGeometry(0.105, 18, 14);
    const capitalNodeGeometry = new THREE.SphereGeometry(0.065, 14, 10);
    const hitGeometry = new THREE.SphereGeometry(0.34, 10, 8);
    const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

    months.forEach((month, index) => {
      const nodeGroup = new THREE.Group();
      nodeGroup.userData.index = index;
      const wealthNodeMaterial = (month.isPending ? pendingMaterial : wealthMaterial).clone();
      const capitalNodeMaterial = (month.isPending ? pendingMaterial : capitalMaterial).clone();
      const wealthNode = new THREE.Mesh(nodeGeometry, wealthNodeMaterial);
      wealthNode.position.copy(wealthPoints[index]);
      wealthNode.userData.index = index;
      nodeGroup.add(wealthNode);
      const capitalNode = new THREE.Mesh(capitalNodeGeometry, capitalNodeMaterial);
      capitalNode.position.copy(capitalPoints[index]);
      nodeGroup.add(capitalNode);
      const connectorMaterial = resultMaterial.clone();
      connectorMaterial.opacity = 0.48;
      const connectorHeight = Math.max(0.03, Math.abs(wealthPoints[index].y - capitalPoints[index].y));
      const connector = new THREE.Mesh(new THREE.BoxGeometry(0.026, connectorHeight, 0.026), connectorMaterial);
      connector.position.set(xFor(index), (wealthPoints[index].y + capitalPoints[index].y) / 2, 0.08);
      nodeGroup.add(connector);
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.2, 0.018, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0xc7a65f, transparent: true, opacity: index === activeIndex ? 0.95 : 0.12 })
      );
      halo.position.copy(wealthPoints[index]);
      halo.position.z += 0.01;
      halo.userData.role = 'halo';
      nodeGroup.add(halo);
      const hit = new THREE.Mesh(hitGeometry, hitMaterial.clone());
      hit.position.copy(wealthPoints[index]);
      hit.userData.index = index;
      nodeGroup.add(hit);
      hitTargets.push(hit);
      nodeGroups.push(nodeGroup);
      world.add(nodeGroup);

      const movementGroup = new THREE.Group();
      movementGroup.userData.hasMovement = Boolean(month.increments || month.decrements || month.isPending);
      const markerBaseY = chartBottom + 0.18;
      if (month.increments > 0) {
        const height = clamp((month.increments / scale.maximum) * 4.2, 0.34, 1.15);
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.052, height, 0.052), movementInMaterial.clone());
        shaft.position.set(xFor(index) - 0.13, markerBaseY + height / 2, 0.64);
        movementGroup.add(shaft);
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.24, 4), movementInMaterial.clone());
        arrow.position.set(xFor(index) - 0.13, markerBaseY + height + 0.11, 0.64);
        movementGroup.add(arrow);
      }
      if (month.decrements > 0) {
        const height = clamp((month.decrements / scale.maximum) * 4.2, 0.34, 1.05);
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.052, height, 0.052), movementOutMaterial.clone());
        shaft.position.set(xFor(index) + 0.13, markerBaseY + height / 2, 0.64);
        movementGroup.add(shaft);
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.24, 4), movementOutMaterial.clone());
        arrow.rotation.z = Math.PI;
        arrow.position.set(xFor(index) + 0.13, markerBaseY - 0.03, 0.64);
        movementGroup.add(arrow);
      }
      movementGroups.push(movementGroup);
      world.add(movementGroup);
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let frame = 0;
    let visible = !document.hidden;
    let lastRender = 0;
    let introProgress = reducedMotion ? 1 : 0;
    let mobileView = false;
    const frameInterval = 1000 / (highDensity ? 28 : 45);

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      const aspect = width / height;
      mobileView = width < 720;
      const verticalHalf = mobileView ? 3.65 : 3.55;
      camera.left = -verticalHalf * aspect;
      camera.right = verticalHalf * aspect;
      camera.top = verticalHalf;
      camera.bottom = -verticalHalf;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const updatePointer = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(hitTargets, false)[0];
      if (!hit) {
        setHover(null);
        canvas.style.cursor = 'crosshair';
        return;
      }
      const index = Number(hit.object.userData.index);
      if (!Number.isFinite(index)) return;
      setHover({ index, x: event.clientX - bounds.left, y: event.clientY - bounds.top });
      canvas.style.cursor = 'pointer';
    };

    const selectPointerMonth = () => {
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(hitTargets, false)[0];
      const index = Number(hit?.object.userData.index);
      if (Number.isFinite(index)) onSelectRef.current(index, 'grafico');
    };
    const handlePointerLeave = () => setHover(null);

    const handleVisibility = () => { visible = !document.hidden; };
    const animate = (time: number) => {
      frame = window.requestAnimationFrame(animate);
      if (!visible || time - lastRender < frameInterval) return;
      lastRender = time;
      const current = activeIndexRef.current;
      const currentLens = lensRef.current;
      const targetCameraX = mobileView ? xFor(current) : 0;
      const smoothing = reducedMotion ? 1 : 0.1;
      camera.position.x += (targetCameraX - camera.position.x) * smoothing;
      camera.zoom += ((zoomRef.current / 100) - camera.zoom) * smoothing;
      camera.updateProjectionMatrix();

      if (introProgress < 1) introProgress = Math.min(1, introProgress + 0.018);
      world.scale.x = introProgress;
      world.position.x = -chartWidth / 2 * (1 - introProgress);
      focus.position.x += (xFor(current) - focus.position.x) * smoothing;

      nodeGroups.forEach((group, index) => {
        const selected = index === current;
        const nodeScale = selected ? 1.55 : 1;
        const capitalScale = selected ? 1.35 : 1;
        group.children[0]?.scale.lerp(new THREE.Vector3(nodeScale, nodeScale, nodeScale), reducedMotion ? 1 : 0.12);
        group.children[1]?.scale.lerp(new THREE.Vector3(capitalScale, capitalScale, capitalScale), reducedMotion ? 1 : 0.12);
        const halo = group.children.find((child) => child.userData.role === 'halo') as THREE.Mesh | undefined;
        if (halo && halo.material instanceof THREE.Material) {
          halo.scale.lerp(new THREE.Vector3(selected ? 1.25 : 1, selected ? 1.25 : 1, selected ? 1.25 : 1), reducedMotion ? 1 : 0.12);
          halo.material.opacity += ((selected ? 0.95 : 0.12) - halo.material.opacity) * 0.12;
        }
        const movementMonth = movementGroups[index]?.userData.hasMovement;
        group.visible = currentLens !== 'movements' || movementMonth || selected;
      });

      const wealthOpacity = currentLens === 'movements' ? 0.22 : 1;
      const capitalOpacity = currentLens === 'movements' ? 0.16 : 1;
      (wealthPath.material as THREE.Material).transparent = true;
      (wealthPath.material as THREE.Material).opacity = wealthOpacity;
      wealthGlowMaterial.opacity += (((currentLens === 'trajectory' ? 0.22 : 0.13) * wealthOpacity) - wealthGlowMaterial.opacity) * 0.1;
      (capitalPath.material as THREE.Material).transparent = true;
      (capitalPath.material as THREE.Material).opacity = capitalOpacity;
      resultMeshes.forEach((mesh) => {
        const material = mesh.material as THREE.Material;
        material.opacity += (((currentLens === 'composition' ? 0.3 : currentLens === 'trajectory' ? 0.08 : 0.03)) - material.opacity) * 0.1;
      });
      movementGroups.forEach((group) => {
        group.visible = Boolean(group.userData.hasMovement);
        group.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const material = object.material as THREE.Material;
          material.transparent = true;
          material.opacity = currentLens === 'movements' ? 1 : 0.72;
        });
      });

      renderer.render(scene, camera);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    canvas.addEventListener('pointermove', updatePointer);
    canvas.addEventListener('pointerdown', updatePointer);
    canvas.addEventListener('pointerup', selectPointerMonth);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    document.addEventListener('visibilitychange', handleVisibility);
    frame = window.requestAnimationFrame(animate);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      canvas.removeEventListener('pointermove', updatePointer);
      canvas.removeEventListener('pointerdown', updatePointer);
      canvas.removeEventListener('pointerup', selectPointerMonth);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      document.removeEventListener('visibilitychange', handleVisibility);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
        meshMaterials.forEach((material) => materials.add(material));
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }, [months, reducedMotion, scale]);

  if (rendererState === 'fallback') return <FormaFallback {...props} />;

  return (
    <div ref={hostRef} className="forma-scene-shell">
      <div className="forma-scene-axis" aria-hidden="true">
        {tickValues.map((value) => <span key={value}>{compactCurrency(value)}</span>)}
      </div>
      <canvas ref={canvasRef} className="forma-scene-canvas" aria-label="Trayectoria tridimensional interactiva del patrimonio" />
      <div className="forma-scene-orientation" aria-hidden="true"><span>Capital neto</span><span>Patrimonio</span></div>
      <div className="forma-scene-zoom" aria-label="Control de acercamiento">
        <button type="button" aria-label="Acercar visualización" onClick={() => setZoom((current) => clamp(current + 10, 80, 130))}>+</button>
        <button type="button" aria-label="Restablecer acercamiento" onClick={() => setZoom(100)}><span>{zoom}%</span></button>
        <button type="button" aria-label="Alejar visualización" onClick={() => setZoom((current) => clamp(current - 10, 80, 130))}>-</button>
      </div>
      {rendererState === 'checking' ? <div className="forma-scene-loading" role="status"><i /><span>Preparando la trayectoria</span></div> : null}
      {hoveredMonth && hover ? (
        <div
          className="forma-scene-tooltip"
          style={{
            left: clamp(hover.x + 16, 12, Math.max(12, (hostRef.current?.clientWidth ?? 320) - 286)),
            top: clamp(hover.y - 154, 58, Math.max(58, (hostRef.current?.clientHeight ?? 320) - 170))
          }}
          role="status"
        >
          <span>{hoveredMonth.label}</span>
          <strong>{formatCurrency(hoveredMonth.balance)}</strong>
          <small>{signedMoney(hoveredMonth.profit)} · {signedPercent(hoveredMonth.returnPct)}</small>
          {hoveredMonth.increments > 0 ? <em>+{formatCurrency(hoveredMonth.increments)} aportado</em> : null}
          {hoveredMonth.decrements > 0 ? <em>-{formatCurrency(hoveredMonth.decrements)} retirado</em> : null}
          <b>Seleccionar mes</b>
        </div>
      ) : null}
    </div>
  );
};
