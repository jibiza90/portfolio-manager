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
  return `${value > 0 ? '+' : '−'}${formatCurrency(Math.abs(value))}`;
};

const signedPercent = (value: number) => {
  if (Math.abs(value) < 0.005) return '0,00 %';
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} %`;
};

const FormaFallback: React.FC<FormaPatrimonySceneProps> = ({ months, activeIndex, lens, onSelect }) => {
  const width = 1280;
  const height = 620;
  const left = 78;
  const right = 44;
  const top = 48;
  const bottom = 92;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maximum = Math.max(1, ...months.flatMap((month) => [month.balance, month.netCapital]));
  const minimum = Math.min(0, ...months.flatMap((month) => [month.balance, month.netCapital]));
  const range = Math.max(1, maximum - minimum);
  const xFor = (index: number) => left + (months.length === 1 ? plotWidth / 2 : (index / (months.length - 1)) * plotWidth);
  const yFor = (value: number) => top + ((maximum - value) / range) * plotHeight;
  const wealthPath = months.map((month, index) => `${index ? 'L' : 'M'} ${xFor(index)} ${yFor(month.balance)}`).join(' ');
  const capitalPath = months.map((month, index) => `${index ? 'L' : 'M'} ${xFor(index)} ${yFor(month.netCapital)}`).join(' ');
  const areaPath = `${wealthPath} ${months.slice().reverse().map((month, reverseIndex) => {
    const index = months.length - 1 - reverseIndex;
    return `L ${xFor(index)} ${yFor(month.netCapital)}`;
  }).join(' ')} Z`;

  return (
    <div className="forma-scene-fallback" data-renderer="svg-compatible">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Construcción patrimonial interactiva en modo compatible">
        <defs>
          <linearGradient id="forma-profit-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#caa96a" stopOpacity="0.5" />
            <stop offset="1" stopColor="#caa96a" stopOpacity="0.06" />
          </linearGradient>
          <filter id="forma-soft-shadow" x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#273c3a" floodOpacity="0.14" />
          </filter>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = top + tick * plotHeight;
          return <line key={tick} x1={left} x2={width - right} y1={y} y2={y} className="forma-fallback-grid" />;
        })}
        {lens !== 'composition' ? <path d={areaPath} fill="url(#forma-profit-fill)" /> : null}
        <path d={capitalPath} className="forma-fallback-capital" />
        <path d={wealthPath} className="forma-fallback-wealth" filter="url(#forma-soft-shadow)" />
        {months.map((month, index) => {
          const x = xFor(index);
          const y = yFor(month.balance);
          const isActive = index === activeIndex;
          const movementVisible = lens !== 'movements' || month.increments > 0 || month.decrements > 0 || month.isPending;
          return (
            <g key={month.key} className={`${isActive ? 'is-active' : ''}${movementVisible ? '' : ' is-muted'}`}>
              <line x1={x} x2={x} y1={y} y2={top + plotHeight} className="forma-fallback-stem" />
              {month.increments > 0 ? <path d={`M ${x - 25} ${y + 20} L ${x - 8} ${y + 20}`} className="forma-fallback-in" /> : null}
              {month.decrements > 0 ? <path d={`M ${x + 8} ${y + 28} L ${x + 25} ${y + 28}`} className="forma-fallback-out" /> : null}
              <circle cx={x} cy={y} r={isActive ? 10 : 6} className="forma-fallback-node" />
              <text x={x} y={height - 47} textAnchor="middle">{month.shortLabel}</text>
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
      <span className="forma-compatible-note">Visualización compatible · todos los datos permanecen disponibles</span>
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
  const zoomRef = useRef(0);
  const [rendererState, setRendererState] = useState<'checking' | 'webgl' | 'fallback'>('checking');
  const [hover, setHover] = useState<HoverState | null>(null);
  const [zoom, setZoom] = useState(0);
  const hoveredMonth = hover ? months[hover.index] : null;
  const maximum = useMemo(() => Math.max(1, ...months.flatMap((month) => [month.balance, month.netCapital])), [months]);

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
    const constrainedDevice = (window.devicePixelRatio || 1) > 1.8;
    const pixelRatio = constrainedDevice
      ? host.clientWidth > 1200 ? 0.9 : 1.2
      : Math.min(window.devicePixelRatio || 1, host.clientWidth > 1200 ? 1.2 : 1.4);
    renderer.setPixelRatio(pixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !constrainedDevice;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xf3efe6, 0.048);
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
    camera.position.set(3.8, 5.4, 10.8);

    const world = new THREE.Group();
    world.rotation.y = -0.07;
    scene.add(world);

    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x59706c, 2.6);
    scene.add(hemisphere);
    const keyLight = new THREE.DirectionalLight(0xfff7df, 5.2);
    keyLight.position.set(-4, 10, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);
    const edgeLight = new THREE.DirectionalLight(0x80c8bb, 2.4);
    edgeLight.position.set(8, 4, -5);
    scene.add(edgeLight);

    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xe9e4d9, roughness: 0.94, metalness: 0.02 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 28), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.08;
    ground.receiveShadow = true;
    world.add(ground);

    const capitalMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x244d49,
      roughness: 0.42,
      metalness: 0.08,
      clearcoat: 0.35,
      clearcoatRoughness: 0.34
    });
    const profitMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xd0ad68,
      roughness: 0.13,
      metalness: 0.04,
      transmission: 0.38,
      transparent: true,
      opacity: 0.72,
      thickness: 0.9,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12
    });
    const negativeMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xb86159,
      roughness: 0.27,
      transparent: true,
      opacity: 0.72,
      transmission: 0.16
    });
    const pendingMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x8aa8a1,
      roughness: 0.22,
      transparent: true,
      opacity: 0.48,
      wireframe: true
    });
    const inflowMaterial = new THREE.MeshStandardMaterial({ color: 0xb89350, roughness: 0.34, metalness: 0.35 });
    const outflowMaterial = new THREE.MeshStandardMaterial({ color: 0xa95650, roughness: 0.43, metalness: 0.12 });
    const spineMaterial = new THREE.MeshBasicMaterial({ color: 0x718b84, transparent: true, opacity: 0.34 });
    const selectedMaterial = new THREE.MeshBasicMaterial({ color: 0xd6b568, transparent: true, opacity: 0.95 });
    const materialTemplates: THREE.Material[] = [
      capitalMaterial,
      profitMaterial,
      negativeMaterial,
      pendingMaterial,
      inflowMaterial,
      outflowMaterial,
      spineMaterial,
      selectedMaterial
    ];
    const cloneMaterial = <T extends THREE.Material>(source: T) => {
      const material = source.clone() as T;
      material.userData.baseOpacity = material.opacity;
      material.transparent = true;
      return material;
    };

    const spacing = 1.18;
    const structureHeight = 5.6;
    const capitalFloor = 0.34;
    const profitFloor = 0.08;
    const structureGroups: THREE.Group[] = [];
    const hitTargets: THREE.Object3D[] = [];
    const pathPoints: THREE.Vector3[] = [];

    months.forEach((month, index) => {
      const group = new THREE.Group();
      group.position.x = index * spacing;
      group.userData.index = index;
      const capitalHeight = Math.max(capitalFloor, (Math.max(0, month.netCapital) / maximum) * structureHeight);
      const rawResult = month.balance - month.netCapital;
      const resultHeight = Math.max(profitFloor, (Math.abs(rawResult) / maximum) * structureHeight);
      const width = month.isPending ? 0.62 : 0.72;

      const capital = new THREE.Mesh(
        new THREE.BoxGeometry(width, capitalHeight, 1.04),
        cloneMaterial(month.isPending ? pendingMaterial : capitalMaterial)
      );
      capital.position.y = capitalHeight / 2;
      capital.castShadow = true;
      capital.receiveShadow = true;
      capital.userData.index = index;
      group.add(capital);
      hitTargets.push(capital);

      const result = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.94, resultHeight, 0.98),
        cloneMaterial(month.isPending ? pendingMaterial : rawResult >= 0 ? profitMaterial : negativeMaterial)
      );
      result.position.y = rawResult >= 0 ? capitalHeight + resultHeight / 2 : Math.max(resultHeight / 2, capitalHeight - resultHeight / 2);
      result.castShadow = true;
      result.userData.index = index;
      result.userData.role = 'result';
      group.add(result);
      hitTargets.push(result);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(width + 0.09, 0.035, 1.13), cloneMaterial(selectedMaterial));
      cap.position.y = Math.max(capitalHeight, capitalHeight + (rawResult >= 0 ? resultHeight : 0)) + 0.035;
      cap.userData.role = 'cap';
      group.add(cap);

      if (month.increments > 0) {
        const inflowSize = clamp((month.increments / maximum) * 4.2, 0.16, 0.72);
        const inflow = new THREE.Mesh(new THREE.BoxGeometry(0.34, inflowSize, 0.7), cloneMaterial(inflowMaterial));
        inflow.position.set(-0.62, Math.max(0.16, inflowSize / 2), 0.05);
        inflow.castShadow = true;
        inflow.userData.role = 'movement';
        inflow.userData.index = index;
        group.add(inflow);
        hitTargets.push(inflow);
      }

      if (month.decrements > 0) {
        const outflowSize = clamp((month.decrements / maximum) * 4.2, 0.16, 0.65);
        const outflow = new THREE.Mesh(new THREE.BoxGeometry(0.34, outflowSize, 0.7), cloneMaterial(outflowMaterial));
        outflow.position.set(0.62, Math.max(0.16, outflowSize / 2), 0.05);
        outflow.castShadow = true;
        outflow.userData.role = 'movement';
        outflow.userData.index = index;
        group.add(outflow);
        hitTargets.push(outflow);
      }

      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 2.8), cloneMaterial(spineMaterial));
      rib.position.set(0, 0.03, 0);
      group.add(rib);

      const totalHeight = Math.max(capitalHeight, capitalHeight + (rawResult >= 0 ? resultHeight : 0));
      pathPoints.push(new THREE.Vector3(index * spacing, totalHeight + 0.2, 0));
      structureGroups.push(group);
      world.add(group);
    });

    let trajectoryMaterial: THREE.Material | null = null;
    if (pathPoints.length > 1) {
      const path = new THREE.CatmullRomCurve3(pathPoints, false, 'catmullrom', 0.18);
      trajectoryMaterial = cloneMaterial(selectedMaterial);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(40, months.length * 8), 0.018, 6, false), trajectoryMaterial);
      tube.userData.role = 'trajectory';
      world.add(tube);
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const dragStart = { x: 0, y: 0, active: false, moved: false };
    let frame = 0;
    let visible = !document.hidden;
    let targetCameraX = activeIndex * spacing;
    let targetCameraY = 5.4;
    let targetCameraZ = 10.8;
    let lastTime = performance.now();
    let lastRenderTime = 0;
    const frameInterval = 1000 / (constrainedDevice ? 24 : 45);

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const updatePointer = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(hitTargets, false)[0];
      if (!hit) {
        setHover(null);
        canvas.style.cursor = dragStart.active ? 'grabbing' : 'grab';
        return;
      }
      const index = Number(hit.object.userData.index);
      if (!Number.isFinite(index)) return;
      setHover({ index, x: event.clientX - bounds.left, y: event.clientY - bounds.top });
      canvas.style.cursor = 'pointer';
    };

    const handlePointerDown = (event: PointerEvent) => {
      dragStart.x = event.clientX;
      dragStart.y = event.clientY;
      dragStart.active = true;
      dragStart.moved = false;
      updatePointer(event);
      canvas.setPointerCapture?.(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (dragStart.active && Math.abs(event.clientX - dragStart.x) > 8) dragStart.moved = true;
      updatePointer(event);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const delta = event.clientX - dragStart.x;
      const moved = dragStart.moved;
      dragStart.active = false;
      canvas.releasePointerCapture?.(event.pointerId);
      if (moved && Math.abs(delta) > 44) {
        onSelectRef.current(clamp(activeIndexRef.current + (delta < 0 ? 1 : -1), 0, months.length - 1), 'arrastre');
        return;
      }
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(hitTargets, false)[0];
      const index = Number(hit?.object.userData.index);
      if (Number.isFinite(index)) onSelectRef.current(index, 'escena');
    };

    const handlePointerLeave = () => {
      if (!dragStart.active) setHover(null);
    };

    const handleVisibility = () => { visible = !document.hidden; };

    const animate = (time: number) => {
      frame = window.requestAnimationFrame(animate);
      if (!visible) return;
      if (time - lastRenderTime < frameInterval) return;
      lastRenderTime = time;
      const delta = Math.min(0.05, (time - lastTime) / 1000);
      lastTime = time;
      const current = activeIndexRef.current;
      const currentLens = lensRef.current;
      targetCameraX = current * spacing + (currentLens === 'composition' ? 2.55 : 1.7);
      targetCameraY = currentLens === 'trajectory' ? 6.8 : 5.35;
      targetCameraZ = (currentLens === 'trajectory' ? 13.4 : currentLens === 'movements' ? 11.8 : 10.5) + zoomRef.current;
      const smoothing = reducedMotion ? 1 : 1 - Math.pow(0.001, delta);
      camera.position.x += (targetCameraX - camera.position.x) * smoothing;
      camera.position.y += (targetCameraY - camera.position.y) * smoothing;
      camera.position.z += (targetCameraZ - camera.position.z) * smoothing;
      camera.lookAt(current * spacing, 2.15, 0);

      structureGroups.forEach((group, index) => {
        const selected = index === current;
        const month = months[index];
        const movementMonth = month.increments > 0 || month.decrements > 0 || month.isPending;
        const targetScale = selected ? 1.11 : currentLens === 'composition' ? 0.88 : 0.98;
        group.scale.x += (targetScale - group.scale.x) * (reducedMotion ? 1 : 0.08);
        group.scale.y += (targetScale - group.scale.y) * (reducedMotion ? 1 : 0.08);
        group.scale.z += (targetScale - group.scale.z) * (reducedMotion ? 1 : 0.08);
        group.position.z += (((selected ? 0.48 : 0) - group.position.z) * (reducedMotion ? 1 : 0.08));
        const structureOpacity = currentLens === 'movements'
          ? movementMonth ? 0.48 : 0.11
          : currentLens === 'trajectory'
            ? selected ? 1 : 0.74
            : selected ? 1 : 0.54;
        group.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            const baseOpacity = Number(material.userData.baseOpacity ?? 1);
            const role = object.userData.role;
            const layerOpacity = role === 'cap'
              ? selected ? 1 : currentLens === 'movements' && !movementMonth ? 0.06 : 0.14
              : role === 'movement'
                ? currentLens === 'movements' ? 1 : selected ? 1 : 0.64
                : structureOpacity;
            material.opacity = baseOpacity * layerOpacity;
            material.transparent = true;
          });
        });
      });

      if (trajectoryMaterial) {
        const baseOpacity = Number(trajectoryMaterial.userData.baseOpacity ?? 1);
        trajectoryMaterial.opacity = baseOpacity * (currentLens === 'trajectory' ? 1 : currentLens === 'composition' ? 0.3 : 0.14);
      }

      renderer.render(scene, camera);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    document.addEventListener('visibilitychange', handleVisibility);
    frame = window.requestAnimationFrame(animate);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      document.removeEventListener('visibilitychange', handleVisibility);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>(materialTemplates);
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
  }, [maximum, months, reducedMotion]);

  if (rendererState === 'fallback') return <FormaFallback {...props} />;

  return (
    <div ref={hostRef} className="forma-scene-shell">
      <canvas ref={canvasRef} className="forma-scene-canvas" aria-label="Escultura tridimensional interactiva del patrimonio" />
      <div className="forma-scene-zoom" aria-label="Control de acercamiento">
        <button type="button" aria-label="Acercar visualización" onClick={() => setZoom((current) => clamp(current - 1.1, -2.4, 2.8))}>+</button>
        <button type="button" aria-label="Restablecer acercamiento" onClick={() => setZoom(0)}><span>{Math.round((1 - zoom / 10.8) * 100)}%</span></button>
        <button type="button" aria-label="Alejar visualización" onClick={() => setZoom((current) => clamp(current + 1.1, -2.4, 2.8))}>−</button>
      </div>
      {rendererState === 'checking' ? <div className="forma-scene-loading" role="status"><i /><span>Construyendo el patrimonio</span></div> : null}
      {hoveredMonth && hover ? (
        <div
          className="forma-scene-tooltip"
          style={{
            left: clamp(hover.x + 14, 10, Math.max(10, (hostRef.current?.clientWidth ?? 320) - 254)),
            top: clamp(hover.y - 142, 74, Math.max(74, (hostRef.current?.clientHeight ?? 320) - 150))
          }}
          role="status"
        >
          <span>{hoveredMonth.label}</span>
          <strong>{formatCurrency(hoveredMonth.balance)}</strong>
          <small>{signedMoney(hoveredMonth.profit)} · {signedPercent(hoveredMonth.returnPct)}</small>
          {hoveredMonth.increments > 0 ? <em>+{formatCurrency(hoveredMonth.increments)} aportado</em> : null}
          {hoveredMonth.decrements > 0 ? <em>−{formatCurrency(hoveredMonth.decrements)} retirado</em> : null}
        </div>
      ) : null}
    </div>
  );
};
