/**
 * Mapa de competencias (radar). SVG propio y sin animación: el acta se imprime y se firma, así que el gráfico
 * tiene que ser determinista. Cada serie se distingue por color, trazo y forma de marcador, no solo por color,
 * para que se lea igual en blanco y negro.
 */
export type SerieKey = 'persona' | 'equipo' | 'udes';

export const SERIES: Record<SerieKey, { label: string; color: string; dash?: string; marker: 'circle' | 'diamond' | 'square' }> = {
  persona: { label: 'Colaborador', color: '#1d4ed8', marker: 'circle' },
  equipo: { label: 'Equipo', color: '#b45309', dash: '5 3', marker: 'diamond' },
  udes: { label: 'Promedio UDES', color: '#475569', dash: '1.5 3', marker: 'square' },
};

export interface RadarAxis { persona: number | null; equipo: number | null; udes: number | null }

interface Props {
  axes: RadarAxis[];
  /** Escala máxima (5). */
  max: number;
  /** Valor del centro del gráfico. Se acerca a los datos para que las diferencias se vean; los anillos indican el valor. */
  min: number;
  ariaLabel: string;
}

const W = 300;
const H = 306;
const CX = W / 2;
const CY = 154;
const R = 112;

export function RadarChart({ axes, max, min: MIN, ariaLabel }: Props) {
  const n = axes.length;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, v: number) => {
    const r = ((Math.min(max, Math.max(MIN, v)) - MIN) / (max - MIN)) * R;
    return [CX + r * Math.cos(ang(i)), CY + r * Math.sin(ang(i))] as const;
  };
  const poly = (f: (i: number) => number) => axes.map((_, i) => pt(i, f(i)).map((x) => x.toFixed(1)).join(',')).join(' ');
  const rings = Array.from({ length: Math.ceil(max - MIN) }, (_, k) => MIN + k + 1);
  const tieneEquipo = axes.some((a) => a.equipo != null);

  const keys: SerieKey[] = ['udes', ...(tieneEquipo ? (['equipo'] as SerieKey[]) : []), 'persona'];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} style={{ width: '100%', height: 'auto', display: 'block', fontFamily: 'inherit' }}>
      {/* Anillos: el más externo (la nota máxima) un poco más marcado */}
      {rings.map((v) => (
        <polygon key={v} points={poly(() => v)} fill="none" stroke={v === max ? '#94a3b8' : '#d5dce6'} strokeWidth={v === max ? 0.9 : 0.6} />
      ))}
      {/* Ejes */}
      {axes.map((_, i) => {
        const [x, y] = pt(i, max);
        return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="#d5dce6" strokeWidth={0.6} />;
      })}
      {/* Valores de los anillos sobre el primer eje */}
      {rings.map((v) => {
        const [, y] = pt(0, v);
        return (
          <text key={v} x={CX + 3.5} y={y - 1.5} fontSize={9} fontWeight={600} fill="#475569" stroke="#fff" strokeWidth={2.6} paintOrder="stroke" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {v}
          </text>
        );
      })}

      {/* Series: UDES al fondo, la persona encima */}
      {keys.map((k) => {
        const s = SERIES[k];
        const val = (i: number) => axes[i][k] ?? MIN;
        return (
          <g key={k}>
            <polygon
              points={poly(val)}
              fill={k === 'persona' ? 'rgba(29,78,216,0.16)' : 'none'}
              stroke={s.color}
              strokeWidth={k === 'persona' ? 2 : 1.5}
              strokeDasharray={s.dash}
              strokeLinejoin="round"
            />
            {axes.map((a, i) => {
              if (a[k] == null) return null;
              const [x, y] = pt(i, a[k] as number);
              if (s.marker === 'circle') return <circle key={i} cx={x} cy={y} r={3.2} fill={s.color} stroke="#fff" strokeWidth={1} />;
              if (s.marker === 'square') return <rect key={i} x={x - 2.8} y={y - 2.8} width={5.6} height={5.6} fill="#fff" stroke={s.color} strokeWidth={1.4} />;
              return <rect key={i} x={x - 2.8} y={y - 2.8} width={5.6} height={5.6} fill={s.color} stroke="#fff" strokeWidth={0.8} transform={`rotate(45 ${x} ${y})`} />;
            })}
          </g>
        );
      })}

      {/* Números de competencia en el borde: la clave está junto al gráfico y en la tabla */}
      {axes.map((_, i) => {
        const [x, y] = [CX + (R + 17) * Math.cos(ang(i)), CY + (R + 17) * Math.sin(ang(i))];
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={9} fill="#365f91" />
            <text x={x} y={y + 3.4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff" style={{ fontVariantNumeric: 'tabular-nums' }}>{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Muestra de una serie para la leyenda (trazo y marcador). */
export function LegendSwatch({ k }: { k: SerieKey }) {
  const s = SERIES[k];
  return (
    <svg viewBox="0 0 26 10" width="2.4em" height="1em" aria-hidden style={{ flex: 'none' }}>
      <line x1="1" y1="5" x2="25" y2="5" stroke={s.color} strokeWidth={k === 'persona' ? 2 : 1.5} strokeDasharray={s.dash} />
      {s.marker === 'circle' && <circle cx="13" cy="5" r="3.2" fill={s.color} stroke="#fff" strokeWidth="1" />}
      {s.marker === 'square' && <rect x="10.2" y="2.2" width="5.6" height="5.6" fill="#fff" stroke={s.color} strokeWidth="1.4" />}
      {s.marker === 'diamond' && <rect x="10.2" y="2.2" width="5.6" height="5.6" fill={s.color} transform="rotate(45 13 5)" />}
    </svg>
  );
}
