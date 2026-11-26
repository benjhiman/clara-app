"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as tus from "tus-js-client";

export default function Uploader({ bookingId, mode }: { bookingId: string; mode: "stream" | "local" }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function finish(videoId: string) {
    await fetch(`/api/videos/${videoId}/listo`, { method: "POST" });
    setDone(true);
    router.refresh();
  }

  async function upload(file: File) {
    setError(null);
    setProgress(0);
    try {
      if (mode === "local") {
        const res = await fetch("/api/videos/local", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId, size: file.size }),
        });
        if (!res.ok) throw new Error("No se pudo empezar la subida");
        const { id, uploadUrl } = (await res.json()) as { id: string; uploadUrl: string | null };
        if (!uploadUrl) {
          // Demo pública: no se sube el archivo, se usa un video de ejemplo
          setProgress(100);
          await finish(id);
          return;
        }
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", uploadUrl);
          xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
          xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error("Falló la subida")));
          xhr.onerror = () => reject(new Error("Sin conexión"));
          xhr.send(file);
        });
        await finish(id);
        return;
      }
      // Cloudflare Stream: subida por partes que se puede retomar si se corta la señal
      let videoId = "";
      await new Promise<void>((resolve, reject) => {
        const up = new tus.Upload(file, {
          endpoint: `/api/videos/tus?bookingId=${bookingId}&name=${encodeURIComponent(file.name)}`,
          chunkSize: 50 * 1024 * 1024,
          retryDelays: [0, 3000, 10000, 30000, 60000],
          metadata: { filename: file.name, filetype: file.type },
          storeFingerprintForResuming: true,
          onAfterResponse: (_req, res) => {
            const id = res.getHeader("X-Video-Id");
            if (id) videoId = id;
          },
          onProgress: (sent, total) => setProgress(Math.round((sent / total) * 100)),
          onError: (e) => reject(e),
          onSuccess: () => resolve(),
        });
        up.findPreviousUploads().then((prev) => {
          if (prev.length) up.resumeFromPreviousUpload(prev[0]);
          up.start();
        });
      });
      if (!videoId) throw new Error("La subida terminó pero no recibimos el id del video. Avisale a la oficina.");
      await finish(videoId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falló la subida");
      setProgress(null);
    }
  }

  if (done) return <p className="notice">✓ Video subido. Al cliente le llega un email cuando esté listo para ver.</p>;

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />
      {progress === null ? (
        <button type="button" className="btn coral block" onClick={() => input.current?.click()}>
          Subir video
        </button>
      ) : (
        <div>
          <div className="progress">
            <div style={{ width: `${progress}%` }} />
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>
            Subiendo… {progress}%. No cierres esta página. Conviene usar Wi-Fi.
          </p>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
