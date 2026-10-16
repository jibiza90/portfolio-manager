import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export interface AetherSceneNode {
  key: string;
  label: string;
  balance: number;
  profit: number;
  returnPct: number;
  increments: number;
  decrements: number;
  isPending?: boolean;
}

interface AetherCapitalSceneProps {
  nodes: AetherSceneNode[];
  activeIndex: number;
  mode: 'story' | 'explore';
  onSelect: (index: number) => void;
}

interface TowerRuntime {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshPhysicalMaterial>;
  edges: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  cap: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  scanner: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  height: number;
  x: number;
}

interface FlowRuntime {
  orb: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  curve: THREE.QuadraticBezierCurve3;
  offset: number;
  speed: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const AetherCapitalScene: React.FC<AetherCapitalSceneProps> = ({
  nodes,
  activeIndex,
  mode,
  onSelect
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const activeRef = useRef(activeIndex);
  const modeRef = useRef(mode);
  const onSelectRef = useRef(onSelect);
  const [availability, setAvailability] = useState<'checking' | 'ready' | 'fallback'>('checking');

  useEffect(() => { activeRef.current = activeIndex; }, [activeIndex]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
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
    renderer.toneMappingExposure = 1.18;
    renderer.setClearColor(0x020708, 1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020708);
    scene.fog = new THREE.FogExp2(0x020708, 0.027);

    const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 180);
    camera.position.set(-6, 7, 13);
    const lookTarget = new THREE.Vector3();
    const targetCamera = new THREE.Vector3();
    const targetLook = new THREE.Vector3();

    const world = new THREE.Group();
    scene.add(world);

    scene.add(new THREE.HemisphereLight(0xbfe9df, 0x081013, 1.15));
    const keyLight = new THREE.DirectionalLight(0xd9fff2, 3.4);
    keyLight.position.set(-8, 14, 9);
    scene.add(keyLight);
    const warmLight = new THREE.PointLight(0xffbd6b, 30, 34, 1.7);
    warmLight.position.set(3, 5, 4);
    scene.add(warmLight);
    const activeLight = new THREE.PointLight(0x55ffd1, 38, 17, 1.5);
    scene.add(activeLight);

    const balances = nodes.map((node) => Math.max(0, node.balance));
    const maxBalance = Math.max(1, ...balances);
    const minPositive = Math.min(...balances.filter((value) => value > 0), maxBalance);
    const span = Math.max(18, (nodes.length - 1) * 2.45);
    const xStart = -span / 2;
    const xFor = (index: number) => nodes.length === 1 ? 0 : xStart + index * (span / (nodes.length - 1));
    const heightFor = (balance: number) => {
      if (balance <= 0) return 0.7;
      const range = Math.max(1, maxBalance - minPositive);
      return 1.35 + ((balance - minPositive) / range) * 7.2;
    };

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(span + 18, 26),
      new THREE.MeshStandardMaterial({
        color: 0x071113,
        roughness: 0.86,
        metalness: 0.2,
        transparent: true,
        opacity: 0.94
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.05;
    world.add(floor);

    const grid = new THREE.GridHelper(span + 18, Math.max(24, nodes.length * 3), 0x2d5d55, 0x17322f);
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.18;
    });
    world.add(grid);

    const horizonGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(xStart - 7, 0.02, -4.8),
      new THREE.Vector3(xStart + span + 7, 0.02, -4.8)
    ]);
    const horizon = new THREE.Line(horizonGeometry, new THREE.LineBasicMaterial({ color: 0x4d8c7e, transparent: true, opacity: 0.3 }));
    world.add(horizon);

    const towers: TowerRuntime[] = [];
    const flowAnimations: FlowRuntime[] = [];
    const pathPoints: THREE.Vector3[] = [];
    const towerMeshes: THREE.Object3D[] = [];

    nodes.forEach((node, index) => {
      const height = heightFor(node.balance);
      const x = xFor(index);
      const z = Math.sin(index * 0.82) * 0.48;
      const isNegative = node.profit < -0.005;
      const color = node.isPending ? 0x72b8ff : isNegative ? 0xff8068 : 0x72ffd1;
      const emissive = node.isPending ? 0x123e68 : isNegative ? 0x5b1e14 : 0x0b5946;

      const material = new THREE.MeshPhysicalMaterial({
        color,
        emissive,
        emissiveIntensity: 0.32,
        roughness: 0.24,
        metalness: 0.34,
        transparent: true,
        opacity: 0.44,
        transmission: 0.08,
        clearcoat: 0.82,
        clearcoatRoughness: 0.22
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1, 0.92), material);
      mesh.position.set(x, height / 2, z);
      mesh.scale.y = 0.001;
      mesh.userData.monthIndex = index;
      world.add(mesh);
      towerMeshes.push(mesh);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.72 })
      );
      edges.position.copy(mesh.position);
      edges.scale.y = 0.001;
      world.add(edges);

      const cap = new THREE.Mesh(
        new THREE.CircleGeometry(0.59, 48),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.58, side: THREE.DoubleSide })
      );
      cap.rotation.x = -Math.PI / 2;
      cap.position.set(x, 0.02, z);
      world.add(cap);

      const scanner = new THREE.Mesh(
        new THREE.PlaneGeometry(1.42, 0.035),
        new THREE.MeshBasicMaterial({ color: 0xe9fff7, transparent: true, opacity: 0, side: THREE.DoubleSide })
      );
      scanner.rotation.x = -Math.PI / 2;
      scanner.position.set(x, 0.05, z);
      world.add(scanner);

      const guideGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0, z),
        new THREE.Vector3(x, height + 0.8, z)
      ]);
      const guideMaterial = new THREE.LineDashedMaterial({ color: 0x6ca99b, dashSize: 0.11, gapSize: 0.16, transparent: true, opacity: 0.2 });
      const guide = new THREE.Line(guideGeometry, guideMaterial);
      guide.computeLineDistances();
      world.add(guide);

      pathPoints.push(new THREE.Vector3(x, height + 0.14, z));
      towers.push({ mesh, edges, cap, scanner, height, x });

      const addFlow = (kind: 'in' | 'out', amount: number, sequence: number) => {
        if (amount <= 0) return;
        const direction = kind === 'in' ? -1 : 1;
        const start = kind === 'in'
          ? new THREE.Vector3(x - 1.9, 0.45, -6.8)
          : new THREE.Vector3(x, height * 0.58, z);
        const end = kind === 'in'
          ? new THREE.Vector3(x, height * 0.58, z)
          : new THREE.Vector3(x + 2.1, 0.55, 6.8);
        const control = new THREE.Vector3(
          x + direction * 0.25,
          Math.max(2.4, height + 1.4),
          direction * 1.2
        );
        const curve = new THREE.QuadraticBezierCurve3(start, control, end);
        const flowColor = kind === 'in' ? 0x57d9ff : 0xffb15f;
        const tube = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 46, 0.018, 7, false),
          new THREE.MeshBasicMaterial({ color: flowColor, transparent: true, opacity: 0.38 })
        );
        world.add(tube);
        const orb = new THREE.Mesh(
          new THREE.SphereGeometry(0.095 + clamp(amount / maxBalance, 0, 0.16), 18, 18),
          new THREE.MeshBasicMaterial({ color: flowColor })
        );
        world.add(orb);
        flowAnimations.push({ orb, curve, offset: index * 0.13 + sequence * 0.31, speed: kind === 'in' ? 0.095 : 0.08 });
      };
      addFlow('in', node.increments, 0);
      addFlow('out', node.decrements, 1);
    });

    if (pathPoints.length > 1) {
      const capitalCurve = new THREE.CatmullRomCurve3(pathPoints, false, 'catmullrom', 0.35);
      const trace = new THREE.Mesh(
        new THREE.TubeGeometry(capitalCurve, Math.max(80, nodes.length * 16), 0.065, 10, false),
        new THREE.MeshBasicMaterial({ color: 0xc8fff0, transparent: true, opacity: 0.84 })
      );
      world.add(trace);
      const echo = new THREE.Mesh(
        new THREE.TubeGeometry(capitalCurve, Math.max(80, nodes.length * 16), 0.19, 10, false),
        new THREE.MeshBasicMaterial({ color: 0x5affca, transparent: true, opacity: 0.075 })
      );
      world.add(echo);
    }

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.025, 10, 96),
      new THREE.MeshBasicMaterial({ color: 0xbaffea, transparent: true, opacity: 0.78 })
    );
    halo.rotation.x = Math.PI / 2;
    world.add(halo);
    const haloEcho = new THREE.Mesh(
      new THREE.TorusGeometry(1.54, 0.012, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0x79ffd6, transparent: true, opacity: 0.24 })
    );
    haloEcho.rotation.x = Math.PI / 2;
    world.add(haloEcho);

    const particleCount = window.innerWidth < 700 ? 150 : 380;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let index = 0; index < particleCount; index += 1) {
      particlePositions[index * 3] = xStart - 8 + Math.random() * (span + 16);
      particlePositions[index * 3 + 1] = 0.35 + Math.random() * 12;
      particlePositions[index * 3 + 2] = -8 + Math.random() * 16;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({ color: 0xa8e8d7, size: 0.026, transparent: true, opacity: 0.42, sizeAttenuation: true })
    );
    scene.add(particles);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pointerState = { downX: 0, downY: 0, lastX: 0, dragging: false, yaw: 0, zoom: 0 };

    const setPointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    };
    const onPointerDown = (event: PointerEvent) => {
      pointerState.downX = event.clientX;
      pointerState.downY = event.clientY;
      pointerState.lastX = event.clientX;
      pointerState.dragging = false;
      canvas.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      const delta = event.clientX - pointerState.lastX;
      if (Math.hypot(event.clientX - pointerState.downX, event.clientY - pointerState.downY) > 5) pointerState.dragging = true;
      if (pointerState.dragging && modeRef.current === 'explore') {
        pointerState.yaw = clamp(pointerState.yaw + delta * 0.0025, -0.34, 0.34);
      }
      pointerState.lastX = event.clientX;
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(towerMeshes, false)[0];
      canvas.style.cursor = hit ? 'pointer' : pointerState.dragging ? 'grabbing' : 'grab';
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!pointerState.dragging) {
        setPointer(event);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(towerMeshes, false)[0];
        const index = hit?.object.userData.monthIndex;
        if (typeof index === 'number') onSelectRef.current(index);
      }
      pointerState.dragging = false;
      canvas.releasePointerCapture?.(event.pointerId);
    };
    const onWheel = (event: WheelEvent) => {
      if (modeRef.current !== 'explore') return;
      event.preventDefault();
      pointerState.zoom = clamp(pointerState.zoom + event.deltaY * 0.006, -3.2, 6.2);
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.25 : 1.55));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clock = new THREE.Clock();
    const startedAt = performance.now();

    const animate = () => {
      frameRef.current = window.requestAnimationFrame(animate);
      const time = clock.getElapsedTime();
      const revealTime = (performance.now() - startedAt) / 1000;
      const selected = clamp(activeRef.current, 0, towers.length - 1);
      const activeTower = towers[selected];
      if (!activeTower) return;

      towers.forEach((tower, index) => {
        const reveal = reducedMotion ? 1 : clamp((revealTime - index * 0.065) / 0.72, 0.001, 1);
        const isActive = index === selected;
        const targetHeight = tower.height * reveal;
        tower.mesh.scale.y = targetHeight;
        tower.mesh.position.y = targetHeight / 2;
        tower.edges.scale.y = targetHeight;
        tower.edges.position.y = targetHeight / 2;
        tower.cap.position.y = targetHeight + 0.018;
        tower.cap.scale.setScalar(isActive ? 1.28 + Math.sin(time * 2.4) * 0.05 : 0.74);
        tower.cap.material.opacity = isActive ? 0.82 : 0.18;
        tower.mesh.material.opacity += ((isActive ? 0.72 : 0.31) - tower.mesh.material.opacity) * 0.08;
        tower.mesh.material.emissiveIntensity += ((isActive ? 1.05 : 0.23) - tower.mesh.material.emissiveIntensity) * 0.08;
        tower.edges.material.opacity += ((isActive ? 0.96 : 0.32) - tower.edges.material.opacity) * 0.08;
        tower.scanner.position.y = 0.08 + ((time * 0.82) % 1) * Math.max(0.1, targetHeight);
        tower.scanner.material.opacity = isActive ? 0.62 : 0;
      });

      const activeHeight = activeTower.mesh.scale.y;
      halo.position.set(activeTower.x, 0.08, activeTower.mesh.position.z);
      haloEcho.position.copy(halo.position);
      const haloPulse = 1 + Math.sin(time * 1.75) * 0.08;
      halo.scale.setScalar(haloPulse);
      haloEcho.scale.setScalar(1 + ((time * 0.16) % 1) * 0.72);
      (haloEcho.material as THREE.MeshBasicMaterial).opacity = 0.24 * (1 - ((time * 0.16) % 1));
      activeLight.position.set(activeTower.x + 0.6, activeHeight + 1.4, activeTower.mesh.position.z + 2.2);

      flowAnimations.forEach((flow) => {
        const progress = (time * flow.speed + flow.offset) % 1;
        flow.orb.position.copy(flow.curve.getPoint(progress));
        flow.orb.scale.setScalar(0.75 + Math.sin(progress * Math.PI) * 0.55);
      });

      particles.rotation.y = reducedMotion ? 0 : time * 0.004;
      particles.position.y = reducedMotion ? 0 : Math.sin(time * 0.14) * 0.12;

      const mobile = canvas.clientWidth < 720;
      const phase = selected % 4;
      const cinematicSway = modeRef.current === 'story' && !reducedMotion ? Math.sin(time * 0.22) * 0.34 : 0;
      targetCamera.set(
        activeTower.x + (mobile ? 0 : -4.9) + pointerState.yaw * 5.4 + cinematicSway,
        clamp(activeHeight * 0.62 + (mobile ? 4.6 : 4.1), 4.7, 9.8) + (phase === 2 ? 0.35 : 0),
        (mobile ? 15.5 : 12.2) + pointerState.zoom
      );
      targetLook.set(activeTower.x + (mobile ? 0 : 1.15), clamp(activeHeight * 0.48, 1.2, 4.8), activeTower.mesh.position.z);
      camera.position.lerp(targetCamera, reducedMotion ? 0.16 : 0.045);
      lookTarget.lerp(targetLook, reducedMotion ? 0.18 : 0.065);
      camera.lookAt(lookTarget);
      world.rotation.y += ((pointerState.yaw * 0.24) - world.rotation.y) * 0.045;
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
      canvas.removeEventListener('wheel', onWheel);
      scene.traverse((object) => {
        const disposable = object as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
        disposable.geometry?.dispose();
        const materials = Array.isArray(disposable.material) ? disposable.material : disposable.material ? [disposable.material] : [];
        materials.forEach((material) => material.dispose());
      });
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }, [nodes]);

  return (
    <div className={`aether-scene${availability === 'fallback' ? ' is-fallback' : ''}`}>
      <canvas ref={canvasRef} className="aether-webgl" aria-label="Visualización tridimensional de la evolución del patrimonio" />
      {availability === 'checking' ? <div className="aether-scene-loading"><i /><span>Construyendo recorrido</span></div> : null}
      {availability === 'fallback' ? (
        <div className="aether-scene-fallback" role="img" aria-label="Evolución del patrimonio por mes">
          <div className="aether-fallback-track">
            {nodes.map((node, index) => {
              const max = Math.max(1, ...nodes.map((item) => item.balance));
              return <button
                type="button"
                key={node.key}
                className={index === activeIndex ? 'is-active' : ''}
                style={{ '--fallback-height': `${18 + node.balance / max * 72}%` } as React.CSSProperties}
                onClick={() => onSelect(index)}
                aria-label={`${node.label}: ${node.balance}`}
              ><i /><span>{node.label}</span></button>;
            })}
          </div>
          <p>Visualización de compatibilidad. Todos los datos permanecen disponibles.</p>
        </div>
      ) : null}
    </div>
  );
};
