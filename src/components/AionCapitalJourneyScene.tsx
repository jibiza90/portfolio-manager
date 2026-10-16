import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { formatCurrency } from '../utils/format';

export type AionJourneyMode = 'overview' | 'story' | 'explore';
export type AionJourneyView = 'wealth' | 'capital' | 'flows';

export interface AionJourneyNode {
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

interface AionCapitalJourneySceneProps {
  nodes: AionJourneyNode[];
  activeIndex: number;
  mode: AionJourneyMode;
  view: AionJourneyView;
  onSelect: (index: number) => void;
}

interface NodeRuntime {
  group: THREE.Group;
  core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhysicalMaterial>;
  shell: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhysicalMaterial>;
  halo: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  hit: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  x: number;
  y: number;
  z: number;
}

interface FlowRuntime {
  particle: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  curve: THREE.QuadraticBezierCurve3;
  direction: 'in' | 'out';
  offset: number;
  speed: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const signedPercent = (value: number) => {
  if (Math.abs(value) < 0.005) return '0,00 %';
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} %`;
};

const signedMoney = (value: number) => {
  if (Math.abs(value) < 0.005) return formatCurrency(0);
  return `${value > 0 ? '+' : '−'}${formatCurrency(Math.abs(value))}`;
};

const colorForNode = (node: AionJourneyNode) => {
  if (node.isPending) return 0x2c74b9;
  if (node.profit < -0.005) return 0xc85c56;
  return 0x0c8d79;
};

export const AionCapitalJourneyScene: React.FC<AionCapitalJourneySceneProps> = ({
  nodes,
  activeIndex,
  mode,
  view,
  onSelect
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const activeRef = useRef(activeIndex);
  const modeRef = useRef(mode);
  const viewRef = useRef(view);
  const onSelectRef = useRef(onSelect);
  const hoveredRef = useRef<number | null>(null);
  const [availability, setAvailability] = useState<'checking' | 'ready' | 'fallback'>('checking');
  const [fallbackHover, setFallbackHover] = useState<number | null>(null);

  useEffect(() => { activeRef.current = activeIndex; }, [activeIndex]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return undefined;

    let renderer: THREE.WebGLRenderer;
    try {
      const probe = document.createElement('canvas');
      const context = probe.getContext('webgl2') || probe.getContext('webgl');
      if (!context) throw new Error('WebGL unavailable');
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });
    } catch {
      setAvailability('fallback');
      return undefined;
    }

    setAvailability('ready');
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0xf7f5ef, 0);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xf7f5ef, 0.018);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 220);
    camera.position.set(0, 9.5, 22);
    const cameraTarget = new THREE.Vector3();
    const desiredPosition = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();

    scene.add(new THREE.HemisphereLight(0xffffff, 0xabc5bd, 2.55));
    const keyLight = new THREE.DirectionalLight(0xfffdf5, 4.8);
    keyLight.position.set(-11, 18, 13);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -32;
    keyLight.shadow.camera.right = 32;
    keyLight.shadow.camera.top = 22;
    keyLight.shadow.camera.bottom = -10;
    scene.add(keyLight);
    const tealLight = new THREE.PointLight(0x6de4cf, 48, 38, 1.6);
    tealLight.position.set(8, 10, 8);
    scene.add(tealLight);
    const warmLight = new THREE.PointLight(0xf5c87d, 35, 32, 1.8);
    warmLight.position.set(-10, 7, -3);
    scene.add(warmLight);

    const world = new THREE.Group();
    scene.add(world);

    const span = Math.max(22, (nodes.length - 1) * 3.15);
    const startX = -span / 2;
    const xFor = (index: number) => nodes.length === 1 ? 0 : startX + index * (span / (nodes.length - 1));
    const zFor = (index: number) => Math.sin(index * 0.62) * 1.35;
    const maxFinancialValue = Math.max(1, ...nodes.flatMap((node) => [Math.abs(node.balance), Math.abs(node.netCapital)]));
    const minFinancialValue = Math.min(0, ...nodes.flatMap((node) => [node.balance, node.netCapital]));
    const valueToY = (value: number) => {
      const normalized = (value - minFinancialValue) / Math.max(1, maxFinancialValue - minFinancialValue);
      return 1.05 + Math.pow(clamp(normalized, 0, 1), 0.7) * 7.4;
    };

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(span + 30, 34),
      new THREE.ShadowMaterial({ color: 0x4c6f68, opacity: 0.11 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.05;
    floor.receiveShadow = true;
    world.add(floor);

    const floorGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(span + 28, 30),
      new THREE.MeshBasicMaterial({ color: 0xe8f2ed, transparent: true, opacity: 0.5, depthWrite: false })
    );
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.position.y = -0.09;
    world.add(floorGlow);

    const grid = new THREE.GridHelper(span + 24, Math.max(28, nodes.length * 4), 0x8fb4aa, 0xd5e1db);
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.22;
    });
    grid.position.y = -0.02;
    world.add(grid);

    const wealthPoints: THREE.Vector3[] = [];
    const capitalPoints: THREE.Vector3[] = [];
    const runtimes: NodeRuntime[] = [];
    const hitTargets: THREE.Object3D[] = [];
    const flows: FlowRuntime[] = [];

    nodes.forEach((node, index) => {
      const x = xFor(index);
      const z = zFor(index);
      const y = valueToY(node.balance);
      const capitalY = valueToY(node.netCapital);
      wealthPoints.push(new THREE.Vector3(x, y, z));
      capitalPoints.push(new THREE.Vector3(x, capitalY, z - 0.48));

      const group = new THREE.Group();
      group.position.set(x, y, z);
      world.add(group);

      const color = colorForNode(node);
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.23, 30, 30),
        new THREE.MeshPhysicalMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.22,
          metalness: 0.08,
          roughness: 0.12,
          clearcoat: 1,
          clearcoatRoughness: 0.08
        })
      );
      core.castShadow = true;
      group.add(core);

      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.43, 32, 32),
        new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          emissive: color,
          emissiveIntensity: 0.08,
          transparent: true,
          opacity: 0.32,
          transmission: 0.34,
          thickness: 0.9,
          roughness: 0.07,
          clearcoat: 1,
          depthWrite: false
        })
      );
      group.add(shell);

      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.62, 0.018, 10, 88),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false })
      );
      halo.rotation.x = Math.PI / 2;
      group.add(halo);

      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(0.72, 16, 16),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.001, depthWrite: false })
      );
      hit.userData.monthIndex = index;
      group.add(hit);
      hitTargets.push(hit);

      const stemGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0.05, z),
        new THREE.Vector3(x, y - 0.32, z)
      ]);
      const stem = new THREE.Line(
        stemGeometry,
        new THREE.LineDashedMaterial({
          color: 0x779d94,
          dashSize: 0.09,
          gapSize: 0.16,
          transparent: true,
          opacity: 0.28
        })
      );
      stem.computeLineDistances();
      world.add(stem);

      const anchor = new THREE.Mesh(
        new THREE.RingGeometry(0.28, 0.31, 48),
        new THREE.MeshBasicMaterial({ color: 0x557e75, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
      );
      anchor.rotation.x = -Math.PI / 2;
      anchor.position.set(x, 0.07, z);
      world.add(anchor);

      const addFlow = (direction: 'in' | 'out', amount: number, offset: number) => {
        if (amount <= 0) return;
        const incoming = direction === 'in';
        const source = incoming
          ? new THREE.Vector3(x - 2.8, 0.6, z - 5.4)
          : new THREE.Vector3(x, y, z);
        const target = incoming
          ? new THREE.Vector3(x, y, z)
          : new THREE.Vector3(x + 3.1, 0.65, z + 5.2);
        const control = new THREE.Vector3(x + (incoming ? -0.9 : 1), Math.max(y + 2.5, 4.2), z);
        const curve = new THREE.QuadraticBezierCurve3(source, control, target);
        const flowColor = incoming ? 0x2b78b8 : 0xdb7656;
        const arc = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 54, 0.018, 7, false),
          new THREE.MeshBasicMaterial({ color: flowColor, transparent: true, opacity: 0.24, depthWrite: false })
        );
        world.add(arc);
        for (let particleIndex = 0; particleIndex < 3; particleIndex += 1) {
          const particle = new THREE.Mesh(
            new THREE.SphereGeometry(0.075 + Math.min(0.07, amount / maxFinancialValue), 16, 16),
            new THREE.MeshBasicMaterial({ color: flowColor, transparent: true, opacity: 0.82 })
          );
          world.add(particle);
          flows.push({
            particle,
            curve,
            direction,
            offset: offset + particleIndex * 0.29,
            speed: incoming ? 0.085 : 0.07
          });
        }
      };
      addFlow('in', node.increments, index * 0.11);
      addFlow('out', node.decrements, index * 0.13 + 0.24);
      runtimes.push({ group, core, shell, halo, hit, x, y, z });
    });

    if (wealthPoints.length > 1) {
      const wealthCurve = new THREE.CatmullRomCurve3(wealthPoints, false, 'catmullrom', 0.42);
      const capitalCurve = new THREE.CatmullRomCurve3(capitalPoints, false, 'catmullrom', 0.42);
      const segments = Math.max(120, nodes.length * 26);
      const wealthGlow = new THREE.Mesh(
        new THREE.TubeGeometry(wealthCurve, segments, 0.18, 12, false),
        new THREE.MeshBasicMaterial({ color: 0x62d9c2, transparent: true, opacity: 0.12, depthWrite: false })
      );
      const wealthLine = new THREE.Mesh(
        new THREE.TubeGeometry(wealthCurve, segments, 0.052, 10, false),
        new THREE.MeshPhysicalMaterial({
          color: 0x087c70,
          emissive: 0x1eb09a,
          emissiveIntensity: 0.25,
          roughness: 0.2,
          metalness: 0.18,
          clearcoat: 1
        })
      );
      const capitalLine = new THREE.Mesh(
        new THREE.TubeGeometry(capitalCurve, segments, 0.03, 8, false),
        new THREE.MeshBasicMaterial({ color: 0xb9934d, transparent: true, opacity: 0.75 })
      );
      world.add(wealthGlow, wealthLine, capitalLine);

      const membranePositions: number[] = [];
      for (let index = 0; index < wealthPoints.length - 1; index += 1) {
        const w1 = wealthPoints[index];
        const w2 = wealthPoints[index + 1];
        const c1 = capitalPoints[index];
        const c2 = capitalPoints[index + 1];
        membranePositions.push(
          w1.x, w1.y, w1.z,
          c1.x, c1.y, c1.z,
          w2.x, w2.y, w2.z,
          w2.x, w2.y, w2.z,
          c1.x, c1.y, c1.z,
          c2.x, c2.y, c2.z
        );
      }
      const membraneGeometry = new THREE.BufferGeometry();
      membraneGeometry.setAttribute('position', new THREE.Float32BufferAttribute(membranePositions, 3));
      membraneGeometry.computeVertexNormals();
      const membrane = new THREE.Mesh(
        membraneGeometry,
        new THREE.MeshPhysicalMaterial({
          color: 0x74cdbc,
          transparent: true,
          opacity: 0.115,
          side: THREE.DoubleSide,
          depthWrite: false,
          roughness: 0.25,
          metalness: 0.02
        })
      );
      world.add(membrane);
      wealthLine.userData.view = 'wealth';
      wealthGlow.userData.view = 'wealth';
      capitalLine.userData.view = 'capital';
      membrane.userData.view = 'capital';
    }

    const focusRig = new THREE.Group();
    const focusRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.82, 0.022, 10, 112),
      new THREE.MeshBasicMaterial({ color: 0x0c8d79, transparent: true, opacity: 0.82, depthWrite: false })
    );
    focusRing.rotation.x = Math.PI / 2;
    const focusRingOuter = new THREE.Mesh(
      new THREE.TorusGeometry(1.12, 0.014, 10, 112),
      new THREE.MeshBasicMaterial({ color: 0xc09b57, transparent: true, opacity: 0.48, depthWrite: false })
    );
    focusRingOuter.rotation.x = Math.PI / 2;
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 18, 18),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
    );
    focusRig.add(focusRing, focusRingOuter, beacon);
    world.add(focusRig);

    const dustCount = window.innerWidth < 760 ? 80 : 190;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let index = 0; index < dustCount; index += 1) {
      dustPositions[index * 3] = startX - 9 + Math.random() * (span + 18);
      dustPositions[index * 3 + 1] = 0.25 + Math.random() * 10;
      dustPositions[index * 3 + 2] = -8 + Math.random() * 16;
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dust = new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({ color: 0x4da997, size: 0.038, transparent: true, opacity: 0.25, depthWrite: false })
    );
    scene.add(dust);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const controls = { downX: 0, downY: 0, lastX: 0, dragging: false, yaw: 0, zoom: 0 };

    const updatePointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const setTooltip = (index: number | null, event?: PointerEvent) => {
      hoveredRef.current = index;
      const tooltip = tooltipRef.current;
      if (!tooltip) return;
      if (index === null || !event) {
        tooltip.dataset.visible = 'false';
        canvas.style.cursor = controls.dragging ? 'grabbing' : 'grab';
        return;
      }
      const node = nodes[index];
      const rect = canvas.getBoundingClientRect();
      tooltip.innerHTML = `
        <span>${node.label}</span>
        <strong>${formatCurrency(node.balance)}</strong>
        <i>Beneficio ${signedMoney(node.profit)}</i>
        <i>Rentabilidad ${signedPercent(node.returnPct)}</i>
        ${(node.increments || node.decrements) ? `<small>${node.increments ? `Aportado ${formatCurrency(node.increments)}` : ''}${node.increments && node.decrements ? ' · ' : ''}${node.decrements ? `Retirado ${formatCurrency(node.decrements)}` : ''}</small>` : ''}
      `;
      const maxLeft = Math.max(12, rect.width - 236);
      tooltip.style.left = `${clamp(event.clientX - rect.left + 16, 12, maxLeft)}px`;
      tooltip.style.top = `${clamp(event.clientY - rect.top - 34, 14, Math.max(14, rect.height - 152))}px`;
      tooltip.dataset.visible = 'true';
      canvas.style.cursor = 'pointer';
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (controls.dragging) {
        const delta = event.clientX - controls.lastX;
        controls.lastX = event.clientX;
        controls.yaw = clamp(controls.yaw + delta * 0.0025, -0.48, 0.48);
        if (Math.abs(event.clientX - controls.downX) > 4 || Math.abs(event.clientY - controls.downY) > 4) {
          setTooltip(null);
        }
        return;
      }
      updatePointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(hitTargets, false)[0];
      const index = hit ? Number(hit.object.userData.monthIndex) : null;
      setTooltip(Number.isFinite(index) ? index : null, event);
    };

    const handlePointerDown = (event: PointerEvent) => {
      controls.dragging = true;
      controls.downX = event.clientX;
      controls.downY = event.clientY;
      controls.lastX = event.clientX;
      canvas.setPointerCapture?.(event.pointerId);
      canvas.style.cursor = 'grabbing';
    };

    const handlePointerUp = (event: PointerEvent) => {
      const wasClick = Math.abs(event.clientX - controls.downX) < 5 && Math.abs(event.clientY - controls.downY) < 5;
      controls.dragging = false;
      canvas.releasePointerCapture?.(event.pointerId);
      if (wasClick) {
        updatePointer(event);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(hitTargets, false)[0];
        const index = hit ? Number(hit.object.userData.monthIndex) : NaN;
        if (Number.isFinite(index)) onSelectRef.current(index);
      }
      canvas.style.cursor = hoveredRef.current === null ? 'grab' : 'pointer';
    };

    const handlePointerLeave = () => {
      controls.dragging = false;
      setTooltip(null);
    };

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      controls.zoom = clamp(controls.zoom + event.deltaY * 0.006, -3.5, 7);
    };

    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(rect.width));
      const nextHeight = Math.max(1, Math.round(rect.height));
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.35 : 1.75);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(canvas);
    window.addEventListener('resize', resize);
    resize();

    const clock = new THREE.Clock();
    const animate = () => {
      const elapsed = clock.getElapsedTime();
      const active = runtimes[clamp(activeRef.current, 0, runtimes.length - 1)];
      const isOverview = modeRef.current === 'overview';
      const compact = width < 760;
      const overviewDistance = Math.max(compact ? 28 : 23, span * (compact ? 0.88 : 0.53));

      if (isOverview) {
        desiredPosition.set(
          Math.sin(controls.yaw) * 8,
          compact ? 11.5 : 10.2,
          overviewDistance + controls.zoom
        );
        desiredTarget.set(0, 3.4, 0);
      } else {
        const orbitRadius = (compact ? 20 : 15.5) + controls.zoom;
        desiredPosition.set(
          active.x + Math.sin(controls.yaw) * orbitRadius,
          compact ? active.y + 7.4 : active.y + 5.7,
          active.z + Math.cos(controls.yaw) * orbitRadius
        );
        desiredTarget.set(active.x, Math.max(2.2, active.y - 0.2), active.z);
      }
      camera.position.lerp(desiredPosition, 0.055);
      cameraTarget.lerp(desiredTarget, 0.065);
      camera.lookAt(cameraTarget);

      runtimes.forEach((runtime, index) => {
        const selected = index === activeRef.current;
        const hovered = index === hoveredRef.current;
        const emphasis = selected ? 1.28 : hovered ? 1.17 : 1;
        runtime.group.scale.lerp(new THREE.Vector3(emphasis, emphasis, emphasis), 0.12);
        runtime.shell.material.opacity += ((selected ? 0.58 : hovered ? 0.46 : 0.27) - runtime.shell.material.opacity) * 0.1;
        runtime.core.material.emissiveIntensity += ((selected ? 0.68 : hovered ? 0.45 : 0.2) - runtime.core.material.emissiveIntensity) * 0.1;
        runtime.halo.material.opacity += ((selected ? 0.82 : hovered ? 0.55 : 0.18) - runtime.halo.material.opacity) * 0.12;
        runtime.halo.rotation.z = elapsed * (selected ? 0.5 : 0.16) + index * 0.11;
      });

      focusRig.position.set(active.x, active.y, active.z);
      focusRing.rotation.z = elapsed * 0.52;
      focusRingOuter.rotation.z = -elapsed * 0.31;
      const focusScale = 1 + Math.sin(elapsed * 2.1) * 0.06;
      focusRig.scale.setScalar(focusScale);
      beacon.position.y = 0.85 + Math.sin(elapsed * 1.8) * 0.16;
      tealLight.position.x = active.x + 3.5;
      tealLight.position.y = active.y + 4;
      tealLight.position.z = active.z + 4;

      flows.forEach((flow) => {
        const raw = (elapsed * flow.speed + flow.offset) % 1;
        const progress = flow.direction === 'in' ? raw : raw;
        flow.particle.position.copy(flow.curve.getPoint(progress));
        const activeFlowView = viewRef.current === 'flows';
        flow.particle.material.opacity = activeFlowView ? 1 : 0.7;
        flow.particle.scale.setScalar(activeFlowView ? 1.35 : 1);
      });

      world.children.forEach((child) => {
        const childView = child.userData.view as AionJourneyView | undefined;
        if (!childView || !(child instanceof THREE.Mesh)) return;
        const targetOpacity = childView === 'capital'
          ? (viewRef.current === 'capital' ? (child.material as THREE.Material & { opacity?: number }).opacity ?? 1 : 0.3)
          : 1;
        if ('opacity' in child.material) {
          const material = child.material as THREE.Material & { opacity: number; transparent: boolean };
          material.transparent = true;
          if (childView === 'capital') material.opacity += (targetOpacity - material.opacity) * 0.08;
        }
      });

      dust.rotation.y = elapsed * 0.003;
      renderer.render(scene, camera);
      frameRef.current = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      canvas.removeEventListener('wheel', handleWheel);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
          object.geometry?.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material?.dispose());
        }
      });
      renderer.dispose();
    };
  }, [nodes]);

  if (availability === 'fallback') {
    const maxValue = Math.max(1, ...nodes.map((node) => node.balance));
    const minValue = Math.min(0, ...nodes.map((node) => node.balance));
    const points = nodes.map((node, index) => ({
      x: nodes.length === 1 ? 500 : 76 + index * (848 / (nodes.length - 1)),
      y: 400 - ((node.balance - minValue) / Math.max(1, maxValue - minValue)) * 300
    }));
    const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
    return (
      <div className="aion-scene-fallback" data-testid="aion-scene-fallback">
        <svg viewBox="0 0 1000 500" role="img" aria-label="Evolución interactiva del patrimonio">
          <defs>
            <linearGradient id="aionFallbackLine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#c09b57" />
              <stop offset="0.45" stopColor="#27af98" />
              <stop offset="1" stopColor="#087c70" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3].map((line) => <line key={line} x1="55" x2="945" y1={100 + line * 100} y2={100 + line * 100} className="aion-fallback-grid" />)}
          <path d={path} className="aion-fallback-path-glow" />
          <path d={path} className="aion-fallback-path" />
          {points.map((point, index) => (
            <g key={nodes[index].key}>
              <line x1={point.x} x2={point.x} y1={point.y + 8} y2="420" className="aion-fallback-stem" />
              <circle cx={point.x} cy={point.y} r={index === activeIndex ? 13 : 8} className={index === activeIndex ? 'is-active' : ''} />
            </g>
          ))}
        </svg>
        <div className="aion-fallback-hits" aria-label="Seleccionar mes">
          {nodes.map((node, index) => (
            <button
              type="button"
              key={node.key}
              aria-label={`Ver ${node.label}`}
              className={index === activeIndex ? 'is-active' : ''}
              onMouseEnter={() => setFallbackHover(index)}
              onMouseLeave={() => setFallbackHover(null)}
              onFocus={() => setFallbackHover(index)}
              onBlur={() => setFallbackHover(null)}
              onClick={() => onSelect(index)}
            >
              <span>{node.shortLabel}</span>
              {fallbackHover === index ? (
                <i>
                  <strong>{formatCurrency(node.balance)}</strong>
                  <small>{signedPercent(node.returnPct)}</small>
                </i>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="aion-scene-shell" data-availability={availability}>
      <canvas ref={canvasRef} className="aion-scene-canvas" aria-label="Recorrido tridimensional interactivo de la inversión" />
      <div ref={tooltipRef} className="aion-scene-tooltip" data-visible="false" aria-hidden="true" />
      {availability === 'checking' ? <div className="aion-scene-loading">Construyendo tu recorrido patrimonial</div> : null}
    </div>
  );
};
