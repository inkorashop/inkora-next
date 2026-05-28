'use client';

import { useEffect, useRef, useState } from 'react';

// ─── Global WebGL context pool ────────────────────────────────────────────────
// Browsers limit WebGL contexts to ~16. This pool prevents overflow.
const MAX_GL_CONTEXTS = 10;
let _activeGlContexts = 0;
function acquireGlContext() {
  if (_activeGlContexts >= MAX_GL_CONTEXTS) return false;
  _activeGlContexts++;
  return true;
}
function releaseGlContext() {
  if (_activeGlContexts > 0) _activeGlContexts--;
}

// ─── BambuStudio ZIP helpers ──────────────────────────────────────────────────

async function readZipEntry(arrayBuf, filename) {
  try {
    const b = new Uint8Array(arrayBuf);
    const dv = new DataView(arrayBuf);
    // Find End of Central Directory (scan backwards from end)
    let eocd = -1;
    const limit = Math.max(0, b.length - 65558 - 22);
    for (let i = b.length - 22; i >= limit; i--) {
      if (b[i] === 0x50 && b[i+1] === 0x4b && b[i+2] === 0x05 && b[i+3] === 0x06) {
        eocd = i; break;
      }
    }
    if (eocd === -1) return null;
    const cdSize   = dv.getUint32(eocd + 12, true);
    const cdOffset = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder('utf-8');
    let p = cdOffset;
    while (p + 46 <= cdOffset + cdSize) {
      if (b[p] !== 0x50 || b[p+1] !== 0x4b || b[p+2] !== 0x01 || b[p+3] !== 0x02) break;
      const method  = dv.getUint16(p + 10, true);
      const compSz  = dv.getUint32(p + 20, true);
      const fnLen   = dv.getUint16(p + 28, true);
      const extLen  = dv.getUint16(p + 30, true);
      const cmtLen  = dv.getUint16(p + 32, true);
      const lhOff   = dv.getUint32(p + 42, true);
      const name    = dec.decode(b.subarray(p + 46, p + 46 + fnLen));
      if (name === filename) {
        const lhFnLen  = dv.getUint16(lhOff + 26, true);
        const lhExtLen = dv.getUint16(lhOff + 28, true);
        const dataOff  = lhOff + 30 + lhFnLen + lhExtLen;
        const raw      = b.slice(dataOff, dataOff + compSz); // slice = copy, safe to pass around
        if (method === 0) return raw;
        if (method === 8 && typeof DecompressionStream !== 'undefined') {
          const ds = new DecompressionStream('deflate-raw');
          const w = ds.writable.getWriter();
          w.write(raw); w.close();
          const r = ds.readable.getReader();
          const chunks = [];
          for (;;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); }
          const total = chunks.reduce((s, c) => s + c.length, 0);
          const out = new Uint8Array(total);
          let off = 0;
          for (const c of chunks) { out.set(c, off); off += c.length; }
          return out;
        }
        return null;
      }
      p += 46 + fnLen + extLen + cmtLen;
    }
  } catch { /* ignore */ }
  return null;
}

async function parseBambuColorData(arrayBuf) {
  const dec = new TextDecoder('utf-8');

  // 1. Filament colors from Metadata/project_settings.config
  const psBytes = await readZipEntry(arrayBuf, 'Metadata/project_settings.config');
  if (!psBytes) return null;
  let filamentColours;
  try {
    const ps = JSON.parse(dec.decode(psBytes));
    const fc = ps.filament_colour;
    filamentColours = (Array.isArray(fc) ? [...fc] : String(fc || '').split(/[\s,]+/))
      .map(c => String(c).trim())
      .filter(c => /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(c));
  } catch { return null; }
  if (!filamentColours.length) return null;

  // 2. Part → extruder mapping from Metadata/model_settings.config
  const msBytes = await readZipEntry(arrayBuf, 'Metadata/model_settings.config');
  if (!msBytes) return null;
  const msXml = dec.decode(msBytes);
  const colorByPartId = {};
  // Extract each <part> block individually to avoid cross-boundary matches
  for (const block of msXml.matchAll(/<part id="(\d+)"[^>]*>([\s\S]*?)<\/part>/g)) {
    const partId = parseInt(block[1]);
    const extM = block[2].match(/<metadata key="extruder" value="(\d+)"/);
    if (extM) {
      const hex = filamentColours[parseInt(extM[1]) - 1];
      if (hex) colorByPartId[partId] = hex;
    }
  }
  if (!Object.keys(colorByPartId).length) return null;

  // 3. Component order from 3D/3dmodel.model (explicit objectid ordering)
  let componentOrder = null;
  const mdBytes = await readZipEntry(arrayBuf, '3D/3dmodel.model');
  if (mdBytes) {
    const mdXml = dec.decode(mdBytes);
    // Find the <components> block inside the assembly object
    const compSection = mdXml.match(/<components>([\s\S]*?)<\/components>/);
    if (compSection) {
      componentOrder = [...compSection[1].matchAll(/\bobjectid="(\d+)"/g)]
        .map(m => parseInt(m[1]));
    }
  }

  return { colorByPartId, componentOrder };
}

function applyBambuColorsToModel(model, colorData, THREE) {
  const { colorByPartId, componentOrder } = colorData;
  const meshes = [];
  model.traverse(n => { if (n.isMesh) meshes.push(n); });
  if (!meshes.length) return;

  const matCache = {};
  const getMat = hex => {
    if (!matCache[hex]) matCache[hex] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex), roughness: 0.65, metalness: 0.0,
    });
    return matCache[hex];
  };

  meshes.forEach((mesh, idx) => {
    // Map mesh position to BambuStudio part/objectid
    // If we parsed the component order, use it; otherwise assume sequential (1-based)
    const objectId = componentOrder ? componentOrder[idx] : (idx + 1);
    const hex = objectId != null ? colorByPartId[objectId] : undefined;
    if (hex) mesh.material = getMat(hex);
  });
}

// ─── ModelViewer component ────────────────────────────────────────────────────

export default function ModelViewer({ url, autoRotate = false, hideHint = false, modelConfig = null, onCapture = null, onReady = null, oneShot = false }) {
  const mountRef = useRef(null);
  const cleanupRef = useRef(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!url || !mountRef.current) return;

    // Respect global WebGL context limit
    if (!acquireGlContext()) {
      setStatus('error');
      return;
    }

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
        let loadedModel = null;

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
            isDragging = true; isBlending = false; clearTimeout(returnTimeout);
          });
          el.addEventListener('pointerup', () => {
            returnTimeout = setTimeout(() => {
              const rawTheta = controls._spherical.theta;
              blendFromAngle = Math.atan2(Math.sin(rawTheta), Math.cos(rawTheta));
              blendFromPhi = controls._spherical.phi;
              pendulumAngle = 0; pendulumDir = 1; blendProgress = 0;
              isBlending = true; isDragging = false;
            }, 200);
          });
        }

        // ── Pre-fetch 3MF and parse BambuStudio colors before loading ──
        const is3MF = url.toLowerCase().includes('.3mf') || modelConfig?._fileType === '3mf';
        let bambuColorData = null;
        let loaderUrl = url;
        let blobUrl = null;

        if (is3MF) {
          try {
            const resp = await fetch(url);
            if (resp.ok) {
              const buf = await resp.arrayBuffer();
              bambuColorData = await parseBambuColorData(buf);
              // Give THREE.js the same buffer via blob URL → no second download
              const blob = new Blob([buf], { type: 'application/octet-stream' });
              blobUrl = URL.createObjectURL(blob);
              loaderUrl = blobUrl;
            }
          } catch { /* fall back to original url */ }
        }

        if (cancelled) {
          if (blobUrl) URL.revokeObjectURL(blobUrl);
          return;
        }

        const loader = is3MF ? new ThreeMFLoader() : new GLTFLoader();
        loader.load(
          loaderUrl,
          (result) => {
            if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
            if (cancelled) return;
            const model = is3MF ? result : result.scene;
            loadedModel = model;
            scene.add(model);

            // Apply BambuStudio colors synchronously — before setStatus and onCapture
            if (bambuColorData) applyBambuColorsToModel(model, bambuColorData, THREE);

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
            if (onReady) onReady();
            if (onCapture) {
              requestAnimationFrame(() => {
                const captureSize = 600;
                renderer.setSize(captureSize, captureSize);
                camera.aspect = 1;
                camera.updateProjectionMatrix();
                renderer.render(scene, camera);
                renderer.domElement.toBlob(blob => {
                  if (blob) onCapture(blob);
                  renderer.setSize(w, h);
                  camera.aspect = w / h;
                  camera.updateProjectionMatrix();
                }, 'image/png');
              });
            }
          },
          undefined,
          (err) => {
            if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
            if (cancelled) return;
            console.error('Model load error:', err);
            setStatus('error');
          }
        );

        let animId;
        const animate = () => {
          // oneShot: render once then stop — saves GPU/WebGL resources (e.g. cart thumbnails)
          if (!oneShot) animId = requestAnimationFrame(animate);

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
          if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
          if (loadedModel) {
            loadedModel.traverse?.((object) => {
              if (object.geometry) object.geometry.dispose?.();
              const materials = Array.isArray(object.material) ? object.material : [object.material];
              materials.filter(Boolean).forEach((material) => {
                Object.values(material).forEach((value) => {
                  if (value?.isTexture) value.dispose?.();
                });
                material.dispose?.();
              });
            });
            scene.remove(loadedModel);
          }
          renderer.dispose();
          renderer.forceContextLoss?.();
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
      releaseGlContext();
    };
  }, [url, modelConfig?.mode, modelConfig?.speed, modelConfig?.pendulum_amplitude]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {status === 'loading' && !hideHint && (
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
