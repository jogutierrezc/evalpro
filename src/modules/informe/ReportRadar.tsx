import { SERIES, type SerieId, type Valores } from './informe';

/**
 * Gráfico de araña del informe. SVG propio: se imprime igual que se ve en pantalla (sin librerías de gráficos),
 * y cada serie se distingue por color, trazo y forma de marcador para que se lea en blanco y negro.
 * Los ejes van numerados; los nombres están en la lista de al lado, así que ninguna etiqueta larga se corta.
 */
const W = 320;
const H = 320;
const CX = W / 2;
const CY = H / 2;
const R = 120;

export function Marker({ k, x, y, r = 3.6 }: { k: SerieId; x: number; y: number; r?: number }) {
  const { color, marker } = SERIES[k];
  const common = { fill: color, stroke: '#fff', strokeWidth: 1 };
  if (marker === 'circle') return <circle cx={x} cy={y} r={r} {...common} />;
  if (marker === 'square') return <rect x={x - r + 0.4} y={y - r + 0.4} width={(r - 0.4) * 2} height={(r - 0.4) * 2} {...common} />;
  if (marker === 'triangle') return <polygon points={`${x},${y - r - 0.6} ${x + r + 0.6},${y + r - 0.4} ${x - r - 0.6},${y + r - 0.4}`} {...common} />;
  return <polygon points={`${x},${y - r - 0.8} ${x + r + 0.8},${y} ${x},${y + r + 0.8} ${x - r - 0.8},${y}`} {...common} />;
}

/** Muestra de la leyenda: el mismo trazo y marcador que en el gráfico. */
export function Muestra({ k }: { k: SerieId }) {
  const s = SERIES[k];
  return (
    <svg width="30" height="12" viewBox="0 0 30 12" aria-hidden="true" className="inf-swatch">
      <line x1="1" y1="6" x2="29" y2="6" stroke={s.color} strokeWidth={k === 'persona' ? 2.4 : 1.8} strokeDasharray={s.dash} strokeLinecap="round" />
      <Marker k={k} x={15} y={6} r={3.2} />
    </svg>
  );
}

interface Props {
  axes: Valores[];
  series: SerieId[];
  max: number;
  min: number;
  ariaLabel: string;
}

export function ReportRadar({ axes, series, max, min, ariaLabel }: Props) {
  const n = axes.length;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, v: number, extra = 0) => {
    const r = ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * R + extra;
    return [CX + r * Math.cos(ang(i)), CY + r * Math.sin(ang(i))] as const;
  };
  const rings = Array.from({ length: Math.ceil(max - min) }, (_, k) => min + k + 1);
  const ringPts = (v: number) => axes.map((_, i) => pt(i, v).map((x) => x.toFixed(1)).join(',')).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="inf-radar-svg">
      {rings.map((v) => (
        <polygon key={v} points={ringPts(v)} fill="none" stroke={v === max ? '#94a3b8' : '#d5dce6'} strokeWidth={v === max ? 0.9 : 0.6} />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, max);
        return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="#d5dce6" strokeWidth={0.6} />;
      })}
      {rings.map((v) => {
        const [, y] = pt(0, v);
        return (
          <text key={v} x={CX + 3.5} y={y - 1.5} fontSize={8.5} fontWeight={600} fill="#475569" stroke="#fff" strokeWidth={2.6} paintOrder="stroke" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {v}
          </text>
        );
      })}

      {series.map((k) => {
        const s = SERIES[k];
        const filled = axes.map((a, i) => (a[k] == null ? null : pt(i, a[k] as number))).filter(Boolean) as (readonly [number, number])[];
        if (!filled.length) return null;
        const completo = axes.every((a) => a[k] != null);
        const puntos = filled.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
        return (
          <g key={k} data-radar-serie={k}>
            {completo ? (
              <polygon points={puntos} fill={s.color} fillOpacity={k === 'persona' ? 0.16 : 0.04} stroke={s.color} strokeWidth={k === 'persona' ? 2.4 : 1.7} strokeDasharray={s.dash} strokeLinejoin="round" />
            ) : (
              <polyline points={puntos} fill="none" stroke={s.color} strokeWidth={1.7} strokeDasharray={s.dash} strokeLinejoin="round" />
            )}
            {filled.map(([x, y], i) => (
              <Marker key={i} k={k} x={x} y={y} />
            ))}
          </g>
        );
      })}

      {/* Números de eje: fuera del anillo máximo, así nunca tapan los datos */}
      {axes.map((_, i) => {
        const [x, y] = pt(i, max, 19);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={8.5} fill="#0f172a" />
            <text x={x} y={y + 3.4} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#fff" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
