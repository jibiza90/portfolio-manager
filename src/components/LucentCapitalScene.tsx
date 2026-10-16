import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export type LucentSceneLayer = 'balance' | 'return' | 'profit' | 'flows';

export interface LucentSceneNode {
  key: string;
  label: string;
  shortLabel: string;
  balance: number;
  profit: number;
  returnPct: number;
  increments: number;
  decrements: number;
  isPending?: boolean;
}

interface LucentCapitalSceneProps {
  nodes: LucentSceneNode[];
  activeIndex: number;
  layer: LucentSceneLayer;
  mode: 'summary' | 'story' | 'explore';
  compareIndices?: [number, number] | null;
  onSelect: (index: number) => void;
}

interface PrismRuntime {
  group: THREE.Group;
  body: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshPhysicalMaterial>;
  halo: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  pulse: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  targetHeight: number;
  currentHeight: number;
  x: number;
  z: number;
}

interface FlowRuntime {
  orb: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  curve: THREE.QuadraticBezierCurve3;
  speed: number;
  offset: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const layerValue = (node: LucentSceneNode, layer: LucentSceneLayer) => {
  if (layer === 'return') return node.returnPct;
  if (layer === 'profit') return node.profit;
  if (layer === 'flows') return node.increments + node.decrements;
  return node.balance;
};

const layerColor = (node: LucentSceneNode, layer: LucentSceneLayer) => {
  if (node.isPending) return 0x2d73e8;
  if (layer === 'flows') return node.decrements > node.increments ? 0xe56d52 : 0x1a9d91;
  const value = layerValue(node, layer);
  if (value < -0.005) return 0xdc624d;
  if (layer === 'profit') return 0x1c8c87;
  if (layer === 'return') return 0x1f75bd;
  return 0x1b8d7e;
};

export const LucentCapitalScene: React.FC<LucentCapitalSceneProps> = ({
  nodes,
  activeIndex,
  layer,
  mode,
  compareIndices = null,
  onSelect
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const activeRef = useRef(activeIndex);
  const layerRef = useRef(layer);
  const modeRef = useRef(mode);
  const compareRef = useRef(compareIndices);
  const onSelectRef = useRef(onSelect);
  const hoveredRef = useRef<number | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [availability, setAvailability] = useState<'checking' | 'ready' | 'fallback'>('checking');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => { activeRef.current = activeIndex; }, [activeIndex]);
  useEffect(() => { layerRef.current = layer; }, [layer]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { compareRef.current = compareIndices; }, [compareIndices]);
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
        alpha: false,
        powerPreference: 'high-performance'
      });
    } catch {
      setAvailability('fallback');
      return undefined;
    }

    setAvailability('ready');
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor(0xf4f6f3, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f6f3);
    scene.fog = new THREE.Fog(0xf4f6f3, 24, 68);

    const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 160);
    camera.position.set(-4, 9.2, 18);
    const cameraTarget = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();

    const world = new THREE.Group();
    scene.add(world);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xbfd0c9, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 4.2);
    key.position.set(-10, 18, 12);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -22;
    key.shadow.camera.right = 22;
    key.shadow.camera.top = 18;
    key.shadow.camera.bottom = -10;
    scene.add(key);
    const mintLight = new THREE.PointLight(0x7ee6d5, 36, 34, 1.65);
    mintLight.position.set(7, 10, 8);
    scene.add(mintLight);
    const goldLight = new THREE.PointLight(0xffd188, 30, 28, 1.7);
    goldLight.position.set(-8, 6, -5);
    scene.add(goldLight);
    const focusLight = new THREE.PointLight(0x55c8bc, 44, 19, 1.45);
    scene.add(focusLight);

    const span = Math.max(20, (nodes.length - 1) * 2.65);
    const startX = -span / 2;
    const xFor = (index: number) => nodes.length === 1 ? 0 : startX + index * (span / (nodes.length - 1));
    const zFor = (index: number) => Math.sin(index * 0.72) * 1.15;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(span + 24, 28),
      new THREE.ShadowMaterial({ color: 0x58736c, opacity: 0.13 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.08;
    floor.receiveShadow = true;
    world.add(floor);

    const floorGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(span + 22, 22),
      new THREE.MeshBasicMaterial({
        color: 0xe7f1ed,
        transparent: true,
        opacity: 0.42,
        depthWrite: false
      })
    );
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.position.y = -0.11;
    world.add(floorGlow);

    const grid = new THREE.GridHelper(span + 18, Math.max(24, nodes.length * 3), 0x9cbeb5, 0xd5e3df);
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.34;
    });
    grid.position.y = -0.04;
    world.add(grid);

    const maxByLayer = {
      balance: Math.max(1, ...nodes.map((node) => Math.abs(node.balance))),
      return: Math.max(1, ...nodes.map((node) => Math.abs(node.returnPct))),
      profit: Math.max(1, ...nodes.map((node) => Math.abs(node.profit))),
      flows: Math.max(1, ...nodes.map((node) => Math.abs(node.increments) + Math.abs(node.decrements)))
    };
    const heightFor = (node: LucentSceneNode, currentLayer: LucentSceneLayer) => {
      const absolute = Math.abs(layerValue(node, currentLayer));
      if (absolute < 0.005) return 0.52;
      const ratio = Math.sqrt(absolute / maxByLayer[currentLayer]);
      return 1.05 + ratio * 7.7;
    };

    const prisms: PrismRuntime[] = [];
    const hitTargets: THREE.Object3D[] = [];
    const pathPoints: THREE.Vector3[] = [];
    const flowRuntime: FlowRuntime[] = [];

    nodes.forEach((node, index) => {
      const x = xFor(index);
      const z = zFor(index);
      const height = heightFor(node, layerRef.current);
      const color = layerColor(node, layerRef.current);
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      world.add(group);

      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.74, 0.9, 0.18, 40),
        new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          roughness: 0.28,
          metalness: 0.08,
          transparent: true,
          opacity: 0.86,
          clearcoat: 0.9
        })
      );
      base.position.y = 0.04;
      base.receiveShadow = true;
      base.castShadow = true;
      group.add(base);

      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.53, 0.68, 1, 36, 1, false),
        new THREE.MeshPhysicalMaterial({
          color,
          roughness: 0.16,
          metalness: 0.12,
          transparent: true,
          opacity: 0.68,
          transmission: 0.16,
          thickness: 0.85,
          clearcoat: 1,
          clearcoatRoughness: 0.13
        })
      );
      body.position.y = height / 2 + 0.13;
      body.scale.y = 0.025;
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData.monthIndex = index;
      group.add(body);
      hitTargets.push(body);

      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.46, 0.53, 0.08, 36),
        new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          emissive: color,
          emissiveIntensity: 0.18,
          roughness: 0.15,
          metalness: 0.14,
          transparent: true,
          opacity: 0.92,
          clearcoat: 1
        })
      );
      crown.position.y = height + 0.17;
      crown.userData.followsHeight = true;
      group.add(crown);

      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.82, 0.025, 10, 70),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false })
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = height + 0.25;
      halo.userData.followsHeight = true;
      group.add(halo);

      const pulse = new THREE.Mesh(
        new THREE.RingGeometry(0.86, 0.92, 72),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      pulse.rotation.x = -Math.PI / 2;
      pulse.position.y = 0.145;
      group.add(pulse);

      const guide = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0.16, 0),
          new THREE.Vector3(0, height + 0.2, 0)
        ]),
        new THREE.LineDashedMaterial({
          color: 0x7ca39a,
          dashSize: 0.09,
          gapSize: 0.13,
          transparent: true,
          opacity: 0.2
        })
      );
      guide.computeLineDistances();
      guide.userData.followsHeight = true;
      group.add(guide);

      pathPoints.push(new THREE.Vector3(x, height + 0.22, z));
      prisms.push({ group, body, halo, pulse, targetHeight: height, currentHeight: height, x, z });

      const addFlow = (kind: 'in' | 'out', amount: number, sequence: number) => {
        if (amount <= 0) return;
        const incoming = kind === 'in';
        const start = incoming
          ? new THREE.Vector3(x - 2.2, 0.5, z - 5.3)
          : new THREE.Vector3(x, Math.max(1.1, height * 0.62), z);
        const end = incoming
          ? new THREE.Vector3(x, Math.max(1.1, height * 0.62), z)
          : new THREE.Vector3(x + 2.2, 0.58, z + 5.3);
        const control = new THREE.Vector3(x, height + 2.1, z + (incoming ? -0.65 : 0.65));
        const curve = new THREE.QuadraticBezierCurve3(start, control, end);
        const flowColor = incoming ? 0x147fbe : 0xe58a3d;
        const tube = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 42, 0.022, 7, false),
          new THREE.MeshBasicMaterial({ color: flowColor, transparent: true, opacity: 0.26 })
        );
        world.add(tube);
        const orb = new THREE.Mesh(
          new THREE.SphereGeometry(0.105 + clamp(amount / maxByLayer.flows, 0, 0.16), 18, 18),
          new THREE.MeshBasicMaterial({ color: flowColor })
        );
        world.add(orb);
        flowRuntime.push({ orb, curve, speed: incoming ? 0.085 : 0.07, offset: index * 0.14 + sequence * 0.37 });
      };
      addFlow('in', node.increments, 0);
      addFlow('out', node.decrements, 1);
    });

    if (pathPoints.length > 1) {
      const curve = new THREE.CatmullRomCurve3(pathPoints, false, 'catmullrom', 0.42);
      world.add(new THREE.Mesh(
        new THREE.TubeGeometry(curve, Math.max(96, nodes.length * 18), 0.055, 9, false),
        new THREE.MeshBasicMaterial({ color: 0x177f78, transparent: true, opacity: 0.74 })
      ));
      world.add(new THREE.Mesh(
        new THREE.TubeGeometry(curve, Math.max(96, nodes.length * 18), 0.18, 9, false),
        new THREE.MeshBasicMaterial({ color: 0x62d5c7, transparent: true, opacity: 0.07, depthWrite: false })
      ));
    }

    const dustCount = window.innerWidth < 700 ? 70 : 170;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let index = 0; index < dustCount; index += 1) {
      dustPositions[index * 3] = startX - 8 + Math.random() * (span + 16);
      dustPositions[index * 3 + 1] = 0.2 + Math.random() * 10;
      dustPositions[index * 3 + 2] = -7 + Math.random() * 14;
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dust = new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({ color: 0x6bb9aa, size: 0.035, transparent: true, opacity: 0.32, depthWrite: false })
    );
    scene.add(dust);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const controls = { downX: 0, downY: 0, lastX: 0, dragging: false, yaw: 0, zoom: 0 };

    const focusRig = new THREE.Group();
    const focusRingA = new THREE.Mesh(
      new THREE.TorusGeometry(0.94, 0.018, 10, 96),
      new THREE.MeshBasicMaterial({ color: 0x27a99b, transparent: true, opacity: 0.72, depthWrite: false })
    );
    const focusRingB = new THREE.Mesh(
      new THREE.TorusGeometry(1.18, 0.014, 10, 96),
      new THREE.MeshBasicMaterial({ color: 0x3d83bf, transparent: true, opacity: 0.42, depthWrite: false })
    );
    const focusBeacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
    );
    const focusBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.055, 2.8, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x5bcabd, transparent: true, opacity: 0.18, depthWrite: false })
    );
    focusRingA.rotation.x = Math.PI / 2.35;
    focusRingB.rotation.x = Math.PI / 1.72;
    focusRingB.rotation.y = Math.PI / 3;
    focusBeam.position.y = 1.48;
    focusBeacon.position.y = 2.9;
    focusRig.add(focusRingA, focusRingB, focusBeam, focusBeacon);
    world.add(focusRig);

    const updatePointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    };
    const onPointerDown = (event: PointerEvent) => {
      controls.downX = event.clientX;
      controls.downY = event.clientY;
      controls.lastX = event.clientX;
      controls.dragging = false;
      canvas.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      const delta = event.clientX - controls.lastX;
      if (Math.hypot(event.clientX - controls.downX, event.clientY - controls.downY) > 5) controls.dragging = true;
      if (controls.dragging && modeRef.current === 'explore') {
        controls.yaw = clamp(controls.yaw + delta * 0.0032, -0.55, 0.55);
      }
      controls.lastX = event.clientX;
      updatePointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hit = controls.dragging ? undefined : raycaster.intersectObjects(hitTargets, false)[0];
      const index = typeof hit?.object.userData.monthIndex === 'number' ? hit.object.userData.monthIndex : null;
      if (hoveredRef.current !== index) {
        hoveredRef.current = index;
        setHoveredIndex(index);
      }
      if (index !== null && tooltipRef.current) {
        const rect = canvas.getBoundingClientRect();
        const tooltip = tooltipRef.current;
        const tooltipWidth = tooltip.offsetWidth || 286;
        const tooltipHeight = tooltip.offsetHeight || 172;
        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;
        let x = pointerX + 18;
        if (x + tooltipWidth > rect.width - 12) x = pointerX - tooltipWidth - 18;
        x = clamp(x, 12, Math.max(12, rect.width - tooltipWidth - 12));
        const y = clamp(pointerY - tooltipHeight * 0.52, 64, Math.max(64, rect.height - tooltipHeight - 54));
        tooltip.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      }
      canvas.style.cursor = hit ? 'pointer' : controls.dragging ? 'grabbing' : 'grab';
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!controls.dragging) {
        updatePointer(event);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(hitTargets, false)[0];
        const index = hit?.object.userData.monthIndex;
        if (typeof index === 'number') onSelectRef.current(index);
      }
      controls.dragging = false;
      canvas.releasePointerCapture?.(event.pointerId);
    };
    const onPointerLeave = () => {
      hoveredRef.current = null;
      setHoveredIndex(null);
      canvas.style.cursor = 'grab';
    };
    const onWheel = (event: WheelEvent) => {
      if (modeRef.current !== 'explore') return;
      event.preventDefault();
      controls.zoom = clamp(controls.zoom + event.deltaY * 0.006, -2.5, 7.2);
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.2 : 1.5));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    const clock = new THREE.Clock();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let previousLayer = layerRef.current;

    const animate = () => {
      frameRef.current = window.requestAnimationFrame(animate);
      const time = clock.getElapsedTime();
      const selected = clamp(activeRef.current, 0, prisms.length - 1);
      const selectedPrism = prisms[selected];

      if (previousLayer !== layerRef.current) {
        previousLayer = layerRef.current;
        nodes.forEach((node, index) => {
          const prism = prisms[index];
          prism.targetHeight = heightFor(node, previousLayer);
          const color = new THREE.Color(layerColor(node, previousLayer));
          prism.body.material.color.lerp(color, 1);
          prism.halo.material.color.lerp(color, 1);
          prism.pulse.material.color.lerp(color, 1);
        });
      }

      prisms.forEach((prism, index) => {
        prism.currentHeight = THREE.MathUtils.lerp(prism.currentHeight, prism.targetHeight, reducedMotion ? 1 : 0.07);
        const bodyScale = Math.max(0.025, prism.currentHeight);
        prism.body.scale.y = THREE.MathUtils.lerp(prism.body.scale.y, bodyScale, reducedMotion ? 1 : 0.08);
        prism.body.position.y = prism.currentHeight / 2 + 0.13;
        const crown = prism.group.children.find((child) => child.userData.followsHeight && child instanceof THREE.Mesh && child !== prism.halo);
        if (crown) crown.position.y = prism.currentHeight + 0.17;
        prism.halo.position.y = prism.currentHeight + 0.25;
        prism.halo.rotation.z = reducedMotion ? 0 : time * (index === selected ? 0.42 : 0.12) + index;

        const isSelected = index === selected;
        const isHovered = index === hoveredRef.current;
        const compared = compareRef.current?.includes(index) ?? false;
        prism.body.material.opacity = isSelected ? 0.9 : isHovered ? 0.84 : compared ? 0.78 : 0.55;
        prism.body.material.emissive.setHex(isSelected || isHovered ? layerColor(nodes[index], previousLayer) : 0x000000);
        prism.body.material.emissiveIntensity = isSelected ? 0.18 : isHovered ? 0.11 : 0;
        prism.halo.material.opacity = isSelected ? 0.9 : isHovered ? 0.7 : compared ? 0.62 : 0.18;
        prism.pulse.material.opacity = isSelected ? 0.44 : compared ? 0.24 : 0;
        const pulseScale = isSelected && !reducedMotion ? 1 + Math.sin(time * 2.4) * 0.1 : 1;
        prism.pulse.scale.setScalar(pulseScale);
        prism.group.position.y = !reducedMotion && isSelected ? Math.sin(time * 1.8) * 0.06 : 0;
      });

      flowRuntime.forEach((flow) => {
        const progress = (time * flow.speed + flow.offset) % 1;
        flow.orb.position.copy(flow.curve.getPoint(progress));
        flow.orb.visible = previousLayer === 'flows' || previousLayer === 'balance';
      });

      if (selectedPrism) {
        focusRig.visible = true;
        focusRig.position.set(selectedPrism.x, selectedPrism.currentHeight + 0.48, selectedPrism.z);
        const focusScale = reducedMotion ? 1 : 1 + Math.sin(time * 1.7) * 0.045;
        focusRingA.scale.setScalar(focusScale);
        focusRingB.scale.setScalar(2 - focusScale);
        focusRingA.rotation.z = reducedMotion ? 0.25 : time * 0.34;
        focusRingB.rotation.z = reducedMotion ? -0.35 : -time * 0.23;
        focusBeacon.material.opacity = reducedMotion ? 0.86 : 0.7 + Math.sin(time * 2.5) * 0.25;
        if (modeRef.current === 'summary') {
          const responsiveDistance = span * 1.08 / Math.max(0.56, Math.min(1, camera.aspect));
          cameraTarget.set(0, 10.2, Math.max(22, responsiveDistance));
          lookTarget.set(0, 3.1, 0);
        } else {
          const baseDistance = modeRef.current === 'story' ? 12.8 : 15.2;
          const yaw = modeRef.current === 'explore' ? controls.yaw : 0;
          cameraTarget.set(
            selectedPrism.x - 3.8 + Math.sin(yaw) * 6.4,
            Math.max(5.6, selectedPrism.currentHeight * 0.7 + 3.6),
            selectedPrism.z + baseDistance + controls.zoom + Math.cos(yaw) * 2.2
          );
          lookTarget.set(selectedPrism.x, Math.max(1.4, selectedPrism.currentHeight * 0.44), selectedPrism.z);
        }
        focusLight.position.set(selectedPrism.x + 1.4, selectedPrism.currentHeight + 2.8, selectedPrism.z + 3.2);
      } else focusRig.visible = false;
      camera.position.lerp(cameraTarget, reducedMotion ? 1 : 0.045);
      camera.lookAt(lookTarget);
      dust.rotation.y = reducedMotion ? 0 : time * 0.008;
      world.rotation.y = modeRef.current === 'summary' && !reducedMotion ? Math.sin(time * 0.12) * 0.015 : 0;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('wheel', onWheel);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
          object.geometry?.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material?.dispose());
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }, [nodes]);

  if (availability === 'fallback') {
    const maxValue = Math.max(1, ...nodes.map((node) => Math.abs(layerValue(node, layer))));
    return (
      <div className="lucent-scene-fallback" role="img" aria-label="Representación accesible de la evolución financiera">
        <div className="lucent-fallback-horizon" />
        {nodes.map((node, index) => {
          const height = 18 + Math.sqrt(Math.abs(layerValue(node, layer)) / maxValue) * 72;
          return (
            <button
              key={node.key}
              type="button"
              className={`${index === activeIndex ? 'is-active' : ''}${compareIndices?.includes(index) ? ' is-compared' : ''}`}
              style={{ '--lucent-height': `${height}%` } as React.CSSProperties}
              aria-label={`Seleccionar ${node.label}`}
              onClick={() => onSelect(index)}
            >
              <span />
              <small>{node.shortLabel}</small>
              <div className="lucent-fallback-tooltip">
                <strong>{node.label}</strong>
                <span>Valor de cartera <b>{node.balance.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</b></span>
                <span>Beneficio <b>{node.profit.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</b></span>
                <span>Rentabilidad <b>{node.returnPct.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %</b></span>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`lucent-scene-shell is-${availability}`}>
      {availability === 'checking' ? <div className="lucent-scene-loading">Construyendo el paisaje financiero…</div> : null}
      <canvas ref={canvasRef} className="lucent-scene-canvas" aria-label="Paisaje tridimensional interactivo de la cartera" />
      <div ref={tooltipRef} className={`lucent-scene-tooltip${hoveredIndex !== null ? ' is-visible' : ''}`} aria-hidden={hoveredIndex === null}>
        <span className="lucent-scene-tooltip-kicker">Lectura del cierre</span>
        <strong>{hoveredIndex !== null ? nodes[hoveredIndex]?.label : '—'}</strong>
        <dl>
          <div><dt>Valor de cartera</dt><dd>{hoveredIndex !== null ? nodes[hoveredIndex]?.balance.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '—'}</dd></div>
          <div><dt>Beneficio</dt><dd>{hoveredIndex !== null ? nodes[hoveredIndex]?.profit.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '—'}</dd></div>
          <div><dt>Rentabilidad</dt><dd>{hoveredIndex !== null ? `${nodes[hoveredIndex]?.returnPct.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %` : '—'}</dd></div>
        </dl>
        {hoveredIndex !== null && (nodes[hoveredIndex]?.increments > 0 || nodes[hoveredIndex]?.decrements > 0) ? (
          <div className="lucent-scene-tooltip-flows">
            {nodes[hoveredIndex]?.increments > 0 ? <span>+ {nodes[hoveredIndex].increments.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })} aportados</span> : null}
            {nodes[hoveredIndex]?.decrements > 0 ? <span>− {nodes[hoveredIndex].decrements.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })} retirados</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};
