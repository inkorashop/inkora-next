'use client';

import { useEffect, useRef, useState } from 'react';

export default function ModelViewer({ url, autoRotate = false, hideHint = false, modelConfig = null }) {
  const mountRef = useRef(null);
  const cleanupRef = useRef(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!url || !mountRef.current) return;

    let cancelled = false;
    setStatus('loading');

    async function init() {
      try {
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js');
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');

        if (cancelled) return;
        const el = mountRef.current;
        if (!el) return;

        // Esperar dimensiones reales
        await new Promise(resolve => {
          if (el.clientWidth > 0 && el.clientHeight > 0) { resolve(); return; }
          const ro = new ResizeObserver(() => {
            if (el.clientWidth > 0 && el.clientHeight > 0) { ro.disconnect(); resolve(); }
          });
          ro.observe(el);
        });

        if (cancelled) return;

        const w = el.clientWidth;
        const h = el.clientHeight;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, w / h, 0.001, 10000);

        // Environment map — en try/catch separado para que no rompa todo si falla
        let envTexture = null;
        try {
          const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
          const pmremGenerator = new THREE.PMREMGenerator(renderer);
          pmremGenerator.compileEquirectangularShader();
          envTexture = pmremGenerator.fromScene(new RoomEnvironment()).texture;
          scene.environment = envTexture;
          pmremGenerator.dispose();
        } catch (envErr) {
          console.warn('Environment map no disponible:', envErr);
        }

        // Luces
        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const dir = new THREE.DirectionalLight(0xffffff, 2.5);
        dir.position.set(5, 10, 7);
        dir.castShadow = true;
        dir.shadow.mapSize.width = 1024;
        dir.shadow.mapSize.height = 1024;
        dir.shadow.camera.near = 0.1;
        dir.shadow.camera.far = 500;
        dir.shadow.radius = 8;
        dir.shadow.bias = -0.001;
        scene.add(dir);

        // Rim light (borde trasero)
        const rim = new THREE.DirectionalLight(0xffffff, 0.4);
        rim.position.set(-4, 2, -6);
        scene.add(rim);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableZoom = true;
        controls.enablePan = false;
        const mode = modelConfig?.mode || (autoRotate ? 'rotate' : 'static');
        const speed = modelConfig?.speed ?? 5;
        controls.autoRotate = mode === 'rotate';
        controls.autoRotateSpeed = speed * 2;

        // Péndulo
        let pendulumDir = 1;
        let pendulumAngle = 0;
        let pendulumDist = null;
        const amplitude = modelConfig?.pendulum_amplitude ?? 5;
        const PENDULUM_MAX = Math.PI * (0.05 + (amplitude / 10) * 0.35);
        let isDragging = false;
        let isReturning = false;
        let returnTimeout = null;

        if (mode === 'pendulum') {
          controls.autoRotate = false;
          controls.enableRotate = true;
          el.addEventListener('pointerdown', () => {
            isDragging = true;
            isReturning = false;
            clearTimeout(returnTimeout);
          });
          el.addEventListener('pointerup', () => {
            isDragging = false;
            const camAngle = Math.atan2(camera.position.x, camera.position.z);
            pendulumAngle = Math.max(-PENDULUM_MAX, Math.min(PENDULUM_MAX, camAngle));
            returnTimeout = setTimeout(() => {
              isReturning = true;
            }, 600);
          });
        }

        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        const is3MF = url.toLowerCase().includes('.3mf') || modelConfig?._fileType === '3mf';
        const loader = is3MF ? new ThreeMFLoader() : new GLTFLoader();
        loader.load(
          url,
          (result) => {
            if (cancelled) return;
            const model = is3MF ? result : result.scene;

            // Activar sombras y environment map en todos los meshes
            model.traverse(child => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material && envTexture) {
                  child.material.envMapIntensity = 0.6;
                  child.material.needsUpdate = true;
                }
              }
            });

            scene.add(model);

            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);

            model.position.set(-center.x, -center.y, -center.z);

            // Plano de sombra debajo del modelo
            const shadowY = -size.y / 2 - center.y;
            const planeGeo = new THREE.PlaneGeometry(maxDim * 4, maxDim * 4);
            const planeMat = new THREE.ShadowMaterial({ opacity: 0.25, transparent: true });
            const shadowPlane = new THREE.Mesh(planeGeo, planeMat);
            shadowPlane.rotation.x = -Math.PI / 2;
            shadowPlane.position.y = shadowY;
            shadowPlane.receiveShadow = true;
            scene.add(shadowPlane);

            // Ajustar frustum de sombra al tamaño del modelo
            const shadowCam = dir.shadow.camera;
            shadowCam.left = -maxDim * 2;
            shadowCam.right = maxDim * 2;
            shadowCam.top = maxDim * 2;
            shadowCam.bottom = -maxDim * 2;
            shadowCam.updateProjectionMatrix();

            const fov = camera.fov * (Math.PI / 180);
            const aspect = w / h;
            const distV = (maxDim / 2) / Math.tan(fov / 2);
            const distH = (maxDim / 2) / Math.tan((fov * aspect) / 2);
            const dist = Math.max(distV, distH) * 1.5;

            camera.position.set(0, 0, dist);
            camera.near = dist / 1000;
            camera.far = dist * 100;
            camera.updateProjectionMatrix();

            controls.target.set(0, 0, 0);
            controls.minDistance = dist * 0.3;
            controls.maxDistance = dist * 5;
            controls.update();

            pendulumDist = dist;

            setStatus('ready');
          },
          undefined,
          (err) => {
            if (cancelled) return;
            console.error('Model load error:', err);
            setStatus('error');
          }
        );

        let animId;
        const animate = () => {
          animId = requestAnimationFrame(animate);

          if (mode === 'pendulum' && pendulumDist !== null) {
            if (isDragging) {
              controls.update();
            } else {
              if (isReturning) {
                pendulumAngle += (0 - pendulumAngle) * 0.08;
                if (Math.abs(pendulumAngle) < 0.002) {
                  pendulumAngle = 0;
                  pendulumDir = 1;
                  isReturning = false;
                }
              } else {
                pendulumAngle += pendulumDir * (speed * 0.002);
                if (pendulumAngle > PENDULUM_MAX) { pendulumAngle = PENDULUM_MAX; pendulumDir = -1; }
                if (pendulumAngle < -PENDULUM_MAX) { pendulumAngle = -PENDULUM_MAX; pendulumDir = 1; }
              }
              const easedAngle = Math.sin((pendulumAngle / PENDULUM_MAX) * (Math.PI / 2)) * PENDULUM_MAX;
              camera.position.x = Math.sin(easedAngle) * pendulumDist;
              camera.position.y = 0;
              camera.position.z = Math.cos(easedAngle) * pendulumDist;
              camera.lookAt(0, 0, 0);
            }
          } else {
            controls.update();
          }

          renderer.render(scene, camera);
        };
        animate();

        const ro = new ResizeObserver(() => {
          if (!el || cancelled) return;
          const nw = el.clientWidth;
          const nh = el.clientHeight;
          if (!nw || !nh) return;
          camera.aspect = nw / nh;
          camera.updateProjectionMatrix();
          renderer.setSize(nw, nh);
        });
        ro.observe(el);

        cleanupRef.current = () => {
          cancelAnimationFrame(animId);
          ro.disconnect();
          controls.dispose();
          renderer.dispose();
          if (envTexture) envTexture.dispose();
          if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
        };

      } catch (err) {
        if (!cancelled) {
          console.error('ModelViewer init error:', err);
          setStatus('error');
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [url, modelConfig?.mode, modelConfig?.speed, modelConfig?.pendulum_amplitude]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#eef0f6', gap: 8,
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
              stroke="#9aa3bc" strokeWidth="2" strokeLinecap="round"
            >
              <animateTransform
                attributeName="transform" type="rotate"
                from="0 12 12" to="360 12 12"
                dur="1s" repeatCount="indefinite"
              />
            </path>
          </svg>
          <span style={{ fontSize: 11, color: '#9aa3bc' }}>Cargando modelo...</span>
        </div>
      )}

      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#fef2f2', gap: 4,
        }}>
          <span style={{ fontSize: 22 }}>⚠</span>
          <span style={{ fontSize: 11, color: '#dc2626' }}>No se pudo cargar el modelo</span>
        </div>
      )}

      {status === 'ready' && !hideHint && (
        <div style={{
          position: 'absolute', bottom: 5, right: 8,
          fontSize: 10, color: 'rgba(0,0,0,0.3)',
          pointerEvents: 'none', userSelect: 'none',
        }}>
          Arrastrá para rotar
        </div>
      )}
    </div>
  );
}