'use client';

import { useEffect, useRef, useState } from 'react';

export default function ModelViewer({ url }) {
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
        controls.autoRotate = true;
        controls.autoRotateSpeed = 3;
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        const loader = new GLTFLoader();
        loader.load(
          url,
          (gltf) => {
            if (cancelled) return;
            const model = gltf.scene;
            scene.add(model);

            // Calcular bounding box DESPUÉS de agregar a la escena
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);

            console.log('Model size:', size, 'maxDim:', maxDim, 'center:', center);

            // Centrar el modelo en el origen
            model.position.set(-center.x, -center.y, -center.z);

            // Posicionar cámara basada en el tamaño real del modelo
            const fov = camera.fov * (Math.PI / 180);
            const aspect = w / h;
            // Distancia para que el modelo entre en pantalla con margen
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

            console.log('Camera distance:', dist, 'near:', camera.near, 'far:', camera.far);

            setStatus('ready');
          },
          undefined,
          (err) => {
            if (cancelled) return;
            console.error('GLB load error:', err);
            setStatus('error');
          }
        );

        let animId;
        const animate = () => {
          animId = requestAnimationFrame(animate);
          controls.update();
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
  }, [url]);

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

      {status === 'ready' && (
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