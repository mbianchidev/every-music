import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import { mediaUrl } from '../lib/media.js';

export default function ManagedImage({ src, authenticated = false, alt, ...props }) {
  const [result, setResult] = useState(null);
  const protectedImage = authenticated && src?.startsWith('/realm/media/');
  useEffect(() => {
    setResult(null);
    if (!protectedImage) return undefined;
    const controller = new AbortController();
    let objectUrl;
    conduit.transmit(`/media/${src.slice('/realm/media/'.length)}`, { auth: true, stream: true, signal: controller.signal })
      .then(response => response.blob()).then(blob => {
        if (!controller.signal.aborted) {
          objectUrl = URL.createObjectURL(blob); setResult({ src, url: objectUrl });
        }
      }).catch(failure => { if (!controller.signal.aborted) setResult({ src, error: failure.message }); })
      .finally(() => controller.abort());
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, protectedImage]);
  const current = result?.src === src ? result : null;
  if (protectedImage && current?.error) return <p className="field-error" role="alert">Image unavailable: {current.error}</p>;
  if (protectedImage && !current?.url) return <p role="status">Loading image preview...</p>;
  return <img {...props} src={protectedImage ? current.url : mediaUrl(src)} alt={alt} />;
}
