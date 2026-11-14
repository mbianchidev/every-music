import { useMemo } from 'react';
import { correction, generate } from 'lean-qr';
import { toSvgPath } from 'lean-qr/extras/svg';

// Renders the QR code locally so the otpauth secret never leaves the browser.
export default function QrCode({ value, label, size = 200 }) {
  const code = useMemo(() => generate(value, { minCorrectionLevel: correction.M }), [value]);
  const path = useMemo(() => toSvgPath(code), [code]);
  const span = code.size + 8;
  return (
    <svg className="qr-code" role="img" aria-label={label} width={size} height={size} viewBox={`-4 -4 ${span} ${span}`} shapeRendering="crispEdges">
      <rect x="-4" y="-4" width={span} height={span} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
