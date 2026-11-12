import './acta.css';
import { ActaRow, Person, fechaCorta, fechaLarga, hora12, sello, shortName } from './types';
import { ResultadosPagina } from './ResultadosPaper';
import { Resultados, paginar } from './resultados';

const logo = (f: string) => `${import.meta.env.BASE_URL}acta/${f}`;

function Header({ oficina }: { oficina: string }) {
  return (
    <div className="ph">
      <div className="ph-top">
        <div className="icon"><img src={logo('icontec.png')} alt="Icontec ISO 9001" /><span>SC-CER440961</span></div>
        <span className="sep" />
        <div className="icon"><img src={logo('iqnet.png')} alt="IQNet" /></div>
        <span className="sep" />
        <div className="udes"><img src={logo('udes.png')} alt="Universidad de Santander, vigilada MinEducación, SNIES 2832" /></div>
        <span className="sep" />
        <div className="acr"><img src={logo('acreditada.png')} alt="Acreditada de alta calidad" /></div>
        <div className="eq"><img src={logo('equaa.jpg')} alt="Acreditación internacional EQUAA" /></div>
      </div>
      <div className="ph-bot">
        <div className="of" data-f="oficina">{oficina.toUpperCase()}</div>
        <div className="ac">ACTA<br />GED-FT-032-BUC</div>
        <div>Versión: 09</div>
      </div>
    </div>
  );
}

function Signature({ person, signedAt, signId }: { person: Person; signedAt: string | null; signId: string | null }) {
  return (
    <div className="fb">
      <div className="ln">
        {signedAt ? (
          <div className="sig" data-sig>
            <span className="scr">{shortName(person.nombre)}</span>
            <span className="stamp">
              <svg viewBox="0 0 24 24" fill="none" stroke="#1d6b4a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z" /><path d="M8.5 12l2.5 2.5L16 9.5" /></svg>
              <span>Firmado con OTP el {sello(signedAt)}<br />Transacción {signId}</span>
            </span>
          </div>
        ) : (
          <span className="pend">Pendiente de firma</span>
        )}
      </div>
      <span className="lbl">Firma</span>
      <span className="val"><b>Nombre:</b> {person.nombre}</span>
      <span className="val"><b>Cargo:</b> {person.cargo}</span>
    </div>
  );
}

interface Props {
  acta: Pick<ActaRow, 'oficina' | 'numero' | 'fecha' | 'lugar' | 'hora_inicio' | 'hora_fin' | 'objetivo' | 'asistentes' | 'tipo' | 'seguimiento' | 'agenda' | 'desarrollo' | 'convocatoria' | 'compromisos' | 'anexo' | 'transcriptor' | 'evaluator_signed_at' | 'evaluator_sign_id' | 'evaluated_signed_at' | 'evaluated_sign_id' | 'content_hash'> & { resultados?: Resultados | null };
  evaluator: Person;
  evaluated: Person;
  /** En el editor, un clic sobre el acta salta al campo. */
  onField?: (field: string) => void;
}

/** Réplica del formato institucional GED-FT-032-BUC v09, en 3 páginas A4. */
export function ActaPaper({ acta: a, evaluator, evaluated, onField }: Props) {
  const tipo = a.tipo === 'nueva' ? 'Reunión nueva' : 'Lectura y/o Firma del acta anterior';
  const click = onField ? (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest('[data-f]') as HTMLElement | null;
    if (el?.dataset.f) onField(el.dataset.f);
  } : undefined;
  const sealed = a.evaluator_signed_at && a.evaluated_signed_at;
  // Los resultados de la evaluación van dentro de "IV. Desarrollo": páginas extra justo después de la primera.
  const resPages = a.resultados ? paginar(a.resultados) : [];
  const total = 3 + resPages.length;
  const pgCompromisos = 2 + resPages.length;

  return (
    <div className="acta" data-interactive={onField ? '' : undefined} onClick={click}>
      <article className="acta-page" aria-label="Acta, página 1">
        <Header oficina={a.oficina} />
        <div className="info">
          <div className="a" data-f="numero"><b>No. de Acta:</b>{a.numero}</div>
          <div className="b" data-f="fecha"><b>Fecha:</b>{fechaLarga(a.fecha)}</div>
          <div className="c" data-f="lugar"><b>Lugar:</b>{a.lugar}</div>
          <div className="d" data-f="hora_inicio"><b>Hora Inicio:</b>{hora12(a.hora_inicio)}</div>
          <div className="e" data-f="hora_fin"><b>Hora Final:</b>{hora12(a.hora_fin)}</div>
        </div>
        <div className="sect">
          <div data-f="objetivo"><h4>OBJETIVO:</h4><div className="pv">{a.objetivo}</div></div>
          <div data-f="asistentes"><h4>ASISTENTES:</h4><div className="pv">{a.asistentes}</div></div>
        </div>
        <div className="sect dev">
          <div>
            <h3>DESARROLLO DE LA REUNIÓN</h3>
            <div className="it" data-f="tipo"><b>I.</b><div className="t"><b>{tipo}</b></div></div>
            <div className="it" data-f="seguimiento"><b>II.</b><div><div className="h">Seguimiento a compromisos</div><div className="t">{a.seguimiento}</div></div></div>
            <div className="it" data-f="agenda"><b>III.</b><div><div className="h">Agenda</div><div className="t">{a.agenda}</div></div></div>
            <div className="it" data-f="desarrollo"><b>IV.</b><div><div className="h">Desarrollo</div><div className="t">{a.desarrollo}</div></div></div>
            <div className="it" data-f="convocatoria"><b>V.</b><div><div className="h">Convocatoria:</div><div className="t">{a.convocatoria}</div></div></div>
          </div>
        </div>
        <span className="pg-no">Página 1 de {total}</span>
      </article>

      {a.resultados && resPages.map((pg, i) => (
        <article className="acta-page" aria-label={`Acta, página ${i + 2}: resultados de la evaluación`} key={`res${i}`}>
          <Header oficina={a.oficina} />
          <ResultadosPagina res={a.resultados!} page={pg} evaluated={evaluated} evaluator={evaluator} />
          <span className="pg-no">Página {i + 2} de {total}</span>
        </article>
      ))}

      <article className="acta-page" aria-label={`Acta, página ${pgCompromisos}`}>
        <Header oficina={a.oficina} />
        <div className="cp">
          <div className="band">COMPROMISOS</div>
          <div className="hd"><div>ACTIVIDAD</div><div>RESPONSABLE</div><div>FECHA</div></div>
          {a.compromisos.map((c, i) => (
            <div className="rw" key={c.id} data-f={`comp-${c.id}`}>
              <div>{i + 1}. {c.act}</div><div>{c.resp}</div><div>{fechaCorta(c.fecha)}</div>
            </div>
          ))}
        </div>
        <div className="firmas">
          <h3>Firmas</h3>
          <p>Terminada la reunión, en consenso se firma el acta por todos los participantes.</p>
          <div className="fgrid">
            <Signature person={evaluator} signedAt={a.evaluator_signed_at} signId={a.evaluator_sign_id} />
            <Signature person={evaluated} signedAt={a.evaluated_signed_at} signId={a.evaluated_sign_id} />
          </div>
        </div>
        <div className="annex">
          <div data-f="anexo"><b>Anexo:</b> {a.anexo}</div>
          <div data-f="transcriptor"><b>Transcriptor:</b> {a.transcriptor}</div>
        </div>
        {sealed && a.content_hash && <div className="seal">Documento firmado electrónicamente por las dos partes. Huella SHA-256 del contenido: {a.content_hash}</div>}
        <span className="pg-no">Página {pgCompromisos} de {total}</span>
      </article>

      <article className="acta-page" aria-label={`Acta, página ${total}`}>
        <Header oficina={a.oficina} />
        <div className="cc">
          <h3>CONTROL DE CAMBIOS</h3>
          <div className="tb">
            <div className="r1"><div><b>VERSIÓN</b><br />09</div><div className="h" style={{ display: 'grid', placeItems: 'center' }}>RESPONSABLE</div></div>
            <div className="r1"><div><b>FECHA APROBACIÓN</b><br />01/12/2025</div><div>Wilneider Plata Arguello<br />Coordinador Nacional de Gestión Documental</div></div>
            <div className="h">DESCRIPCIÓN DEL CAMBIO</div>
            <div>
              Se ajusta logos del encabezado:<br />
              Se incluye el logotipo para Acreditación Institucional Nacional Alta Calidad.<br />
              Se incluye el logo de la agencia EQUAA junto a la inscripción “Acreditación Internacional Multicampus”.<br /><br />
              Se ajusta la trazabilidad del formato a GED-FT-032-BUC.<br /><br />
              Se ajustan entradas y presentación del control de cambios, según Procedimiento de Control de Documentos y Registros.
            </div>
          </div>
        </div>
        <span className="pg-no">Página {total} de {total}</span>
      </article>
    </div>
  );
}
