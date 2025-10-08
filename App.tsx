
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/*
  Simona Studio — HairStyleTryOn (v1.3)
  - Branding y paleta actualizada para app de peluquería/beauty
  - Modal de bienvenida con "No volver a mostrar" (localStorage)
  - IA: Detección de morfología (face-api.js lazy) + sugerencias
  - Overlay peinados PNG (shag, bob, ondas balayage)
*/

export default function App() {
  return (
    <div className="min-h-screen text-[var(--text)]">
      <header className="px-4 sm:px-8 py-6 border-b border-[var(--border)] bg-white/90 backdrop-blur sticky top-0 z-30">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">💖 Simona Studio</h1>
            <p className="text-sm text-[var(--muted)] mt-1">Probador inteligente de cortes y peinados impulsado por IA.</p>
          </div>
          <Badge>v1.3</Badge>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-6">
        <TryOnStudio />
      </main>
      <footer className="text-center text-xs text-[var(--muted)] py-6">
        Simona Studio — Demo educativa (Vercel/Netlify ready).
      </footer>
      <WelcomeModal />
    </div>
  );
}

function WelcomeModal(){
  const [open, setOpen] = useState(false);
  useEffect(()=>{
    const hide = localStorage.getItem("simona_hideWelcome");
    if (!hide) setOpen(true);
  },[]);
  const dontShow = () => {
    localStorage.setItem("simona_hideWelcome","1");
    setOpen(false);
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm grid place-items-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-md rounded-2xl surface border border-[var(--border)] p-5 shadow-xl"
            initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold">Bienvenida a <span style={{color:"var(--brand)"}}>Simona Studio</span></h2>
                <p className="text-sm text-[var(--muted)] mt-1">
                  Subí tu foto, dejá que la <b>IA</b> detecte tu forma de rostro y probá estilos recomendados
                  (shag, bob, ondas con balayage). Todo se procesa en tu dispositivo.
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 justify-end">
              <button className="px-3 py-2 rounded-xl brand-outline" onClick={dontShow}>No volver a mostrar</button>
              <button className="px-3 py-2 rounded-xl brand-btn" onClick={()=>setOpen(false)}>Comenzar</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TryOnStudio() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [useCamera, setUseCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [faceShape, setFaceShape] = useState<FaceShape | "auto">("auto");
  const [detectedShape, setDetectedShape] = useState<FaceShape | null>(null);
  const [detectorReady, setDetectorReady] = useState(false);
  const [detectorError, setDetectorError] = useState<string | null>(null);

  const [overlayX, setOverlayX] = useState(0);
  const [overlayY, setOverlayY] = useState(0);
  const [overlayScale, setOverlayScale] = useState(1);
  const [overlayFlip, setOverlayFlip] = useState(false);
  const [overlayAlpha, setOverlayAlpha] = useState(0.95);
  const [activeStyleId, setActiveStyleId] = useState<string>("bob-classic");

  const [kiosk, setKiosk] = useState(false);

  // Cámara
  useEffect(() => {
    (async () => {
      if (useCamera && videoRef.current) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
          (videoRef.current as HTMLVideoElement).srcObject = stream;
          await (videoRef.current as HTMLVideoElement).play();
        } catch (e) {
          console.error(e);
          setUseCamera(false);
          alert("No se pudo acceder a la cámara. Otorga permisos o sube una foto.");
        }
      }
    })();
    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, [useCamera]);

  // Carga face-api.js
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // @ts-ignore
        if (!(window as any).faceapi) {
          await loadScript("https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js");
        }
        // @ts-ignore
        const base = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights";
        // @ts-ignore
        await (window as any).faceapi.nets.tinyFaceDetector.loadFromUri(base);
        // @ts-ignore
        await (window as any).faceapi.nets.faceLandmark68Net.loadFromUri(base);
        if (!cancelled) setDetectorReady(true);
      } catch (err:any) {
        console.warn("Detector no disponible:", err);
        if (!cancelled) setDetectorError("No se pudo cargar el detector facial. Usaremos detección simulada.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Detección auto
  useEffect(() => {
    (async () => {
      if (!imageSrc) { setDetectedShape(null); return; }
      if (faceShape !== "auto") { setDetectedShape(faceShape); return; }
      // @ts-ignore
      const faceapi = (window as any).faceapi;
      if (!faceapi || !detectorReady) {
        const simulated: FaceShape[] = ["oval", "round", "square", "heart", "diamond"];
        setDetectedShape(simulated[Math.floor(Math.random() * simulated.length)]);
        return;
      }
      try {
        const img = await loadImage(imageSrc);
        const detection = await faceapi
          .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks();
        if (!detection) { setDetectedShape(null); return; }
        const pts = detection.landmarks.positions;
        const guess = classifyByGeometry(pts);
        setDetectedShape(guess);
      } catch (e) {
        console.warn("Fallo detección:", e);
        setDetectedShape(null);
      }
    })();
  }, [imageSrc, faceShape, detectorReady]);

  const styles = useMemo<HairStyle[]>(() => ([
    { id: "bob-classic", name: "Bob clásico recto", suited: ["oval","heart","square"], length: "medio-corto", kind: "png", pngUrl: "/hair/bob.png", preview: "png" },
    { id: "shag-texture", name: "Shag capeado", suited: ["oval","heart","round"], length: "medio", kind: "png", pngUrl: "/hair/shag.png", preview: "png" },
    { id: "waves-balayage", name: "Ondas largas balayage", suited: ["oval","round","square"], length: "largo", kind: "png", pngUrl: "/hair/waves.png", preview: "png" },
  ]), []);

  const selected = styles.find(s => s.id === activeStyleId)!;
  const suggested = detectedShape ? styles.filter(s => s.suited.includes(detectedShape)) : styles;

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImageSrc(String(reader.result));
    reader.readAsDataURL(f);
  };

  const captureFromVideo = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = (video as HTMLVideoElement).videoWidth; canvas.height = (video as HTMLVideoElement).videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video as HTMLVideoElement, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    setImageSrc(dataUrl);
    setUseCamera(false);
  };

  const resetOverlay = () => {
    setOverlayX(0); setOverlayY(0); setOverlayScale(1); setOverlayFlip(false); setOverlayAlpha(0.95);
  };
  const clearAll = () => {
    setImageSrc(null); setUseCamera(false); resetOverlay(); setDetectedShape(null); setFaceShape("auto");
  };
  const share = async () => {
    const text = `Mi morfología: ${detectedShape ? labelFace(detectedShape) : "—"}. Estilo: ${selected.name}.`;
    const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
    if (navigator.share) { try { await navigator.share({ text, title: "Simona Studio" }); return; } catch {} }
    window.open(wa, "_blank");
  };

  return (
    <div className={kiosk ? "grid lg:grid-cols-2 gap-6" : "grid lg:grid-cols-3 gap-6"}>
      {/* Panel 1 */}
      <section className="surface rounded-2xl shadow p-4 sm:p-6 border border-[var(--border)]">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-lg">1) Tu foto</h2>
          <label className="flex items-center gap-2 text-xs select-none">
            <input type="checkbox" className="accent-[var(--brand)]" checked={kiosk} onChange={e=>setKiosk(e.target.checked)} />
            Modo salón
          </label>
        </div>
        <p className="text-sm text-[var(--muted)] mb-3">Imagen frontal, buena luz.</p>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm cursor-pointer brand-btn`}>
            <input type="file" accept="image/*" className="hidden" onChange={onPickImage} />
            📷 Subir imagen
          </label>
          <button className={`px-3 py-2 rounded-xl text-sm brand-outline`} onClick={() => setUseCamera(v => !v)}>
            {useCamera ? "Cerrar cámara" : "Usar cámara"}
          </button>
          <button className={`px-3 py-2 rounded-xl text-sm brand-outline`} onClick={share}>Compartir</button>
          <button className={`px-3 py-2 rounded-xl text-sm brand-outline`} onClick={clearAll}>Borrar todo</button>
        </div>

        {useCamera && (
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-black/5">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <div className="absolute bottom-3 left-3 right-3 flex justify-between gap-2">
              <button className="px-3 py-2 rounded-xl brand-outline" onClick={captureFromVideo}>Capturar</button>
              <button className="px-3 py-2 rounded-xl brand-outline" onClick={() => setUseCamera(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {imageSrc && !useCamera && (
          <img src={imageSrc} alt="preview" className="mt-3 rounded-xl w-full object-contain max-h-80 border border-[var(--border)]" />
        )}

        <hr className="my-5 border-[var(--border)]" />

        <h3 className="font-semibold">2) Morfología facial</h3>
        <div className={`flex flex-wrap gap-2 mt-2 ${kiosk?"text-base":""}`}>
          {(["auto","oval","round","square","heart","diamond"] as const).map(opt => (
            <button key={opt} onClick={() => setFaceShape(opt)} className={`px-3 py-1.5 rounded-full text-sm border ${faceShape === opt ? "brand-btn" : "brand-outline"}`}>
              {labelFace(opt)}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--muted)] mt-2">
          Detectado: <b>{detectedShape ? labelFace(detectedShape) : "—"}</b>
          {detectorError && <span style={{color:"var(--brand-strong)"}}> — {detectorError}</span>}
        </p>
        <div className="mt-5 text-xs text-[var(--muted)]">
          <p>Privacidad: todo el procesamiento ocurre en tu dispositivo.</p>
        </div>
      </section>

      {/* Panel 2 */}
      <section className={`surface rounded-2xl shadow p-4 sm:p-6 border border-[var(--border)] ${kiosk?"lg:col-span-1":"lg:col-span-2"}`}>
        <h2 className="font-bold text-lg">3) Vista previa</h2>
        <p className="text-sm text-[var(--muted)]">Ajusta posición, escala y opacidad del peinado.</p>

        <div className="mt-4 grid md:grid-cols-[2fr_1fr] gap-6">
          <div className="relative w-full rounded-xl overflow-hidden bg-[var(--surface-2)] border border-[var(--border)]">
            <div className="absolute inset-0 pointer-events-none" style={{background:"radial-gradient(circle at center, transparent 60%, rgba(0,0,0,.06))"}} />
            <div className="aspect-[4/5] flex items-center justify-center">
              {imageSrc ? (
                <div className="relative w-full h-full">
                  <img src={imageSrc} alt="persona" className="absolute inset-0 w-full h-full object-contain" />
                  <div
                    className="absolute left-1/2 top-1/2"
                    style={{
                      transform: `translate(-50%, -50%) translate(${overlayX}px, ${overlayY}px) scale(${overlayScale}) ${overlayFlip ? "scaleX(-1)" : ""}`,
                      transition: "transform 80ms linear",
                      opacity: overlayAlpha,
                    }}
                  >
                    <img src={selected.pngUrl!} alt={selected.name} className="w-[420px] h-[360px] object-contain" />
                  </div>
                </div>
              ) : (
                <div className="text-[var(--muted)] text-sm">Sube una foto para comenzar.</div>
              )}
            </div>
          </div>

          <div>
            <div className="space-y-3">
              <Slider label="Posición horizontal" min={-200} max={200} value={overlayX} onChange={setOverlayX} kiosk={kiosk} />
              <Slider label="Posición vertical" min={-200} max={200} value={overlayY} onChange={setOverlayY} kiosk={kiosk} />
              <Slider label="Escala" min={0.5} max={2} step={0.01} value={overlayScale} onChange={setOverlayScale} kiosk={kiosk} />
              <Slider label="Antes / Después (opacidad)" min={0} max={1} step={0.01} value={overlayAlpha} onChange={setOverlayAlpha} kiosk={kiosk} />
              <div className="flex flex-wrap items-center gap-2">
                <button className={`px-3 py-2 rounded-xl text-sm brand-outline ${kiosk?"text-base px-4 py-3":""}`} onClick={() => setOverlayFlip(v => !v)}>{overlayFlip ? "Deshacer espejo" : "Espejar"}</button>
                <button className={`px-3 py-2 rounded-xl text-sm brand-outline ${kiosk?"text-base px-4 py-3":""}`} onClick={resetOverlay}>Reiniciar</button>
              </div>
            </div>

            <hr className="my-5 border-[var(--border)]" />
            <h3 className="font-semibold text-sm mb-2">Peinados sugeridos {detectedShape && (<span className="text-xs text-[var(--muted)]">({labelFace(detectedShape)})</span>)}</h3>
            <div className="grid grid-cols-2 gap-2">
              {suggested.map(s => (
                <button key={s.id} onClick={() => setActiveStyleId(s.id)} className={`p-2 rounded-xl text-left border ${activeStyleId === s.id ? "brand-border bg-[#FFF4F9]" : "hover:bg-[#FFF8FB]"}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg overflow-hidden grid place-items-center bg-[var(--surface-2)] border border-[var(--border)]">
                      <img src={s.pngUrl!} alt="prev" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{s.name}</div>
                      <div className="text-xs text-[var(--muted)]">{s.length} • {s.suited.map(labelFace).join(", ")}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <hr className="my-6 border-[var(--border)]" />
        <Recommendations shape={detectedShape} />
      </section>
    </div>
  );
}

function Recommendations({ shape }: { shape: FaceShape | null }) {
  const tips: Record<FaceShape, { do: string[]; avoid: string[] }> = {
    oval: { do: ["Prácticamente todos los estilos","Flequillos ligeros","Bob largo"], avoid: ["Volúmenes extremos que oculten rasgos"] },
    round:{ do:["Altura en la coronilla","Capas largas","Líneas verticales"], avoid:["Mucho volumen lateral a la altura de mejillas"] },
    square:{ do:["Capas suaves","Ondas y texturas","Largos por debajo de la mandíbula"], avoid:["Cortes muy rectos a la altura de la quijada"] },
    heart:{ do:["Volumen en la zona baja","Flequillo cortina","Bob texturizado"], avoid:["Demasiado volumen en sienes"] },
    diamond:{ do:["Flequillos suaves","Ondas medias","Volumen en sienes"], avoid:["Demasiado volumen en pómulos/mandíbula"] },
  };
  if (!shape) return <div className="text-sm text-[var(--muted)]">Selecciona o detecta tu morfología facial para ver recomendaciones.</div>;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="p-4 rounded-xl" style={{background:"#FFF1F7", border:"1px solid var(--border)"}}>
        <h4 className="font-semibold">Qué favorece ({labelFace(shape)})</h4>
        <ul className="list-disc pl-5 text-sm mt-2 space-y-1">{tips[shape].do.map((t,i)=><li key={i}>{t}</li>)}</ul>
      </div>
      <div className="p-4 rounded-xl" style={{background:"#FFF4F1", border:"1px solid var(--border)"}}>
        <h4 className="font-semibold">Mejor evitar</h4>
        <ul className="list-disc pl-5 text-sm mt-2 space-y-1">{tips[shape].avoid.map((t,i)=><li key={i}>{t}</li>)}</ul>
      </div>
    </div>
  );
}

// UI utils
function Slider({ label, min, max, step = 1, value, onChange, kiosk }:{label:string;min:number;max:number;step?:number;value:number;onChange:(v:number)=>void;kiosk:boolean}){
  return (
    <div>
      <label className="text-xs font-semibold">{label}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))} className={`w-full ${kiosk?"h-3":""}`} />
    </div>
  );
}
function Badge({children}:{children:React.ReactNode}){
  return <span className="px-2 py-1 text-[10px] rounded-full border border-[var(--border)] text-[var(--muted)] bg-white">{children}</span>;
}

// Types
type FaceShape = "oval" | "round" | "square" | "heart" | "diamond";
type HairStyle = { id:string; name:string; suited:FaceShape[]; length:string; kind:"png"; pngUrl?:string; preview:"png"; };

function labelFace(k: FaceShape | "auto") {
  return ({ auto:"Auto", oval:"Ovalado", round:"Redondo", square:"Cuadrado", heart:"Corazón", diamond:"Diamante" } as const)[k];
}

// Geometry classifier
function classifyByGeometry(pts: { x:number; y:number }[]): FaceShape {
  const L = (i:number)=>pts[i];
  const jawL = L(3), jawR = L(13);
  const cheekL = L(1), cheekR = L(15);
  const browL = L(17), browR = L(26);
  const chin = L(8);
  const noseTop = L(27);
  const foreheadW = dist(browL, browR);
  const jawW = dist(jawL, jawR);
  const cheekW = dist(cheekL, cheekR);
  const faceH = dist(chin, noseTop) * 1.4;
  const ratioWH = (jawW + cheekW + foreheadW) / 3 / faceH;
  const widest = Math.max(jawW, cheekW, foreheadW);
  const widestTag = widest === jawW ? "jaw" : widest === cheekW ? "cheek" : "forehead";
  const jawA = angle(L(5), L(7), L(9));
  if (ratioWH < 0.70) return "oval";
  if (Math.abs(jawW - cheekW) / cheekW < 0.08 && Math.abs(cheekW - foreheadW) / foreheadW < 0.08) {
    if (jawA > 150) return "square";
    return "round";
  }
  if (widestTag === "forehead" && jawW < cheekW * 0.92) return "heart";
  if (widestTag === "cheek" && foreheadW < cheekW * 0.95 && jawW < cheekW * 0.95) return "diamond";
  return jawA > 150 ? "square" : "oval";
}
function dist(a:{x:number;y:number}, b:{x:number;y:number}){ const dx=a.x-b.x, dy=a.y-b.y; return Math.hypot(dx,dy); }
function angle(a:{x:number;y:number}, b:{x:number;y:number}, c:{x:number;y:number}){
  const ab = {x:a.x-b.x,y:a.y-b.y}; const cb = {x:c.x-b.x,y:c.y-b.y};
  const dot = ab.x*cb.x+ab.y*cb.y; const m = Math.hypot(ab.x,ab.y)*Math.hypot(cb.x,cb.y);
  return Math.min(179, Math.max(1, (Math.acos(Math.min(1, Math.max(-1, dot/(m||1))))*180/Math.PI)));
}
// loaders
function loadScript(src:string){
  return new Promise<void>((resolve, reject)=>{
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = ()=>resolve(); s.onerror = ()=>reject(new Error('script load error'));
    document.head.appendChild(s);
  });
}
function loadImage(dataUrl:string){
  return new Promise<HTMLImageElement>((resolve, reject)=>{
    const img = new Image(); img.onload = ()=>resolve(img); img.onerror = reject; img.src = dataUrl;
  });
}
