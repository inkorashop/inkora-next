'use client';

import { useEffect, useRef, useState } from 'react';

export default function ModelViewer({ url, autoRotate = false, hideHint = false, modelConfig = null, onCapture = null }) {
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
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, w / h, 0.001, 10000);

        scene.add(new THREE.AmbientLight(0xffffff, 1.5));
        const dir = new THREE.DirectionalLight(0xffffff, 2);
        dir.position.set(5, 10, 7);
        scene.add(dir);
        const fill = new THREE.DirectionalLight(0xffffff, 0.5);
        fill.position.set(-5, -5, -5);
        scene.add(fill);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableZoom = true;
        controls.enablePan = false;
        controls.zoomSpeed = 1.2;
        controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        const mode = modelConfig?.mode || (autoRotate ? 'rotate' : 'static');
        const speed = modelConfig?.speed ?? 5;
        const amplitude = modelConfig?.pendulum_amplitude ?? 5;
        const PENDULUM_MAX = Math.PI * (0.05 + (amplitude / 10) * 0.35);

        controls.autoRotate = mode === 'rotate';
        controls.autoRotateSpeed = speed * 2;

        // Estado del péndulo
        let pendulumDist = null;
        let pendulumAngle = 0;
        let pendulumDir = 1;
        let isDragging = false;
        let returnTimeout = null;
        let isBlending = false;
        let blendFromAngle = 0;
        let blendFromPhi = 0;
        let blendProgress = 0;
        let originalPhi = 0;

        function syncControlsTheta(theta) {
          controls._spherical.theta = theta;
          controls._sphericalDelta.theta = 0;
          controls._sphericalDelta.phi = 0;
        }

        if (mode === 'pendulum') {
          controls.autoRotate = false;

          el.addEventListener('pointerdown', () => {
            isDragging = true;
            isBlending = false;
            clearTimeout(returnTimeout);
          });

          el.addEventListener('pointerup', () => {
            returnTimeout = setTimeout(() => {
              const rawTheta = controls._spherical.theta;
              blendFromAngle = Math.atan2(Math.sin(rawTheta), Math.cos(rawTheta));
              blendFromPhi = controls._spherical.phi;
              pendulumAngle = 0;
              pendulumDir = 1;
              blendProgress = 0;
              isBlending = true;
              isDragging = false;
            }, 200);
          });
        }

        const is3MF = url.toLowerCase().includes('.3mf') || modelConfig?._fileType === '3mf';
        const loader = is3MF ? new ThreeMFLoader() : new GLTFLoader();
        loader.load(
          url,
          (result) => {
            if (cancelled) return;
            const model = is3MF ? result : result.scene;
            scene.add(model);

            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);

            model.position.set(-center.x, -center.y, -center.z);

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
            originalPhi = controls._spherical.phi;

            setStatus('ready');
            if (onCapture) {
              requestAnimationFrame(() => {
                renderer.render(scene, camera);
                renderer.domElement.toBlob(blob => { if (blob) onCapture(blob); }, 'image/png');
              });
            }
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
            } else if (isBlending) {
              blendProgress = Math.min(1, blendProgress + 0.018);
              const t = blendProgress;
              const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

              pendulumAngle += pendulumDir * (speed * 0.002);
              if (pendulumAngle > PENDULUM_MAX) { pendulumAngle = PENDULUM_MAX; pendulumDir = -1; }
              if (pendulumAngle < -PENDULUM_MAX) { pendulumAngle = -PENDULUM_MAX; pendulumDir = 1; }
              const pendulumTarget = Math.sin((pendulumAngle / PENDULUM_MAX) * (Math.PI / 2)) * PENDULUM_MAX;

              const currentAngle = blendFromAngle * (1 - eased) + pendulumTarget * eased;
              const currentPhi = blendFromPhi * (1 - eased) + originalPhi * eased;
              syncControlsTheta(currentAngle);
              controls._spherical.phi = currentPhi;
              controls._sphericalDelta.phi = 0;
              const sinPhi = Math.sin(currentPhi);
              const cosPhi = Math.cos(currentPhi);
              const distNow = (controls._spherical.radius > 0.001) ? controls._spherical.radius : pendulumDist;
              camera.position.x = Math.sin(currentAngle) * sinPhi * distNow;
              camera.position.y = cosPhi * distNow;
              camera.position.z = Math.cos(currentAngle) * sinPhi * distNow;
              camera.lookAt(0, 0, 0);

              if (blendProgress >= 1) isBlending = false;
            } else {
              pendulumAngle += pendulumDir * (speed * 0.002);
              if (pendulumAngle > PENDULUM_MAX) { pendulumAngle = PENDULUM_MAX; pendulumDir = -1; }
              if (pendulumAngle < -PENDULUM_MAX) { pendulumAngle = -PENDULUM_MAX; pendulumDir = 1; }

              const easedAngle = Math.sin((pendulumAngle / PENDULUM_MAX) * (Math.PI / 2)) * PENDULUM_MAX;
              syncControlsTheta(easedAngle);
              const sinPhi = Math.sin(originalPhi);
              const cosPhi = Math.cos(originalPhi);
              const distNow = (controls._spherical.radius > 0.001) ? controls._spherical.radius : pendulumDist;
              camera.position.x = Math.sin(easedAngle) * sinPhi * distNow;
              camera.position.y = cosPhi * distNow;
              camera.position.z = Math.cos(easedAngle) * sinPhi * distNow;
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
          clearTimeout(returnTimeout);
          ro.disconnect();
          controls.dispose();
          renderer.dispose();
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