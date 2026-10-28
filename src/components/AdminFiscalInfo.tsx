import React, { useEffect, useState } from 'react';
import { subscribeClientOverview } from '../services/cloudPortfolio';
import { fetchClientCommissions, type ClientCommissionsDoc } from '../services/commissionCloud';
import { AnnualReturnsPanel, DISCLAIMER, type AnnualReturnsSource } from './AnnualReturns';

// Solo para el admin principal: explicacion del informe, respuestas para clientes y generador.

const ANSWERS: Array<{ id: string; question: string; answer: string }> = [
  {
    id: 'nombre',
    question: '¿Por qué el documento se llama «Informe anual de rendimientos» y no «certificado fiscal»?',
    answer: 'Porque no es un documento oficial de Hacienda. Los certificados fiscales los emiten las entidades que retienen impuestos a sus clientes, como los bancos en España. JIGSA Capital Brokering no practica retenciones ni presta asesoramiento fiscal.\n\nEste informe recoge, con la información que tú eliges, lo que ha rendido tu inversión durante el año. Puedes entregárselo a tu asesor o gestor para que valore cómo declararlo. La declaración y su tributación dependen de ti y de tu situación personal.'
  },
  {
    id: 'opcion',
    question: '¿Qué opción tengo que elegir?',
    answer: 'El informe te deja elegir qué quieres que conste: solo el beneficio que hay dentro de lo que has retirado durante el año, o todo el beneficio que ha generado tu inversión en el año, lo hayas retirado o no.\n\nNosotros no podemos decirte cuál debes usar en tu declaración: depende de tu situación y es una decisión tuya o de tu asesor. El documento indica siempre qué opción has elegido.'
  },
  {
    id: 'metodo',
    question: '¿Qué diferencia hay entre «proporcional» y «primero el capital»?',
    answer: 'Son dos formas de separar, en cada retirada, qué parte es tu capital y qué parte es beneficio.\n\nProporcional: cada retirada lleva la misma proporción de capital y de beneficio que tiene tu inversión en ese momento. Por ejemplo, si aportaste 100.000 €, tu inversión vale 120.000 € y retiras 12.000 €, 10.000 € son capital y 2.000 € son beneficio.\n\nPrimero el capital: lo que retiras se considera capital hasta que recuperas todo lo que aportaste; a partir de ahí, beneficio. En el mismo ejemplo, los 12.000 € serían capital y el beneficio sería 0 €.'
  },
  {
    id: 'provisional',
    question: '¿Por qué mi informe pone «provisional»?',
    answer: 'Porque el año todavía no ha terminado o aún no se ha publicado el cierre de diciembre. El informe recoge los datos hasta el último cierre publicado y las cifras pueden cambiar. Cuando se publique el cierre de diciembre podrás descargar la versión definitiva.'
  },
  {
    id: 'comisiones',
    question: '¿Qué comisiones aparecen en el informe?',
    answer: 'Aparecen las comisiones que has pagado durante el año, con la retirada a la que corresponde cada una. Se cobran sobre lo que retiras una vez has recuperado todo el capital aportado.'
  }
];

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="info-add-btn"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        }).catch(() => setCopied(false));
      }}
    >
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  );
};

export const AdminFiscalInfo: React.FC<{ clients: Array<{ id: string; label: string }> }> = ({ clients }) => {
  const [clientId, setClientId] = useState('');
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [commissions, setCommissions] = useState<ClientCommissionsDoc | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clientId) return undefined;
    setLoading(true);
    setOverview(null);
    setCommissions(null);
    void fetchClientCommissions(clientId).then(setCommissions);
    return subscribeClientOverview(clientId, (value) => { setOverview(value); setLoading(false); }, () => setLoading(false));
  }, [clientId]);

  const report = overview?.report as (AnnualReturnsSource & { clientCode?: string }) | null | undefined;
  const holderName = String(overview?.clientName ?? clients.find((client) => client.id === clientId)?.label ?? '');

  return (
    <div className="glass-card fade-in" style={{ display: 'grid', gap: 18 }}>
      <section style={{ border: '1px solid #d7d2c8', borderRadius: 12, background: '#fff', padding: 18, display: 'grid', gap: 12 }}>
        <h3 style={{ margin: 0 }}>Información fiscal · cómo funciona</h3>
        <p className="muted" style={{ margin: 0 }}>Solo lo ves tú. El cliente descarga un «Informe anual de rendimientos» desde el botón «Información fiscal» de su área (de momento solo en demo1).</p>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, color: '#1f2937' }}>
          <li><b>El cliente elige</b> el año y qué quiere que conste: solo lo retirado o todo lo ganado en el año.</li>
          <li><b>Solo lo retirado:</b> elige también el cálculo. Proporcional (cada retirada lleva la parte de capital y de beneficio que tenía la inversión en ese momento) o primero el capital (lo retirado es capital hasta recuperar todo lo aportado).</li>
          <li><b>Todo lo ganado:</b> suma el beneficio publicado de cada mes del año.</li>
          <li><b>Comisiones:</b> aparecen las que has marcado como cobradas en la pantalla de Comisiones, con el mismo cálculo.</li>
          <li><b>Año en curso:</b> sale marcado como PROVISIONAL con los datos hasta el último cierre publicado.</li>
          <li><b>Los datos</b> son los publicados para el cliente (lo mismo que ve en su área), nunca cambios sin publicar.</li>
          <li><b>Sale siempre el aviso</b> de responsabilidad, y el cliente tiene que aceptarlo antes de descargar:<br /><span className="muted">{DISCLAIMER}</span></li>
          <li><b>Por qué «rendimientos» y no «fiscal» en el título:</b> «fiscal» o «certificado» suenan a documento oficial para Hacienda, como los de los bancos españoles que retienen. JIGSA no retiene ni asesora, así que el título chocaría con el aviso. «Rendimientos» dice exactamente lo que es: lo que ha ganado el cliente con el criterio que ha elegido.</li>
        </ul>
      </section>

      <section style={{ border: '1px solid #d7d2c8', borderRadius: 12, background: '#fff', padding: 18, display: 'grid', gap: 12 }}>
        <h3 style={{ margin: 0 }}>Respuestas para clientes</h3>
        {ANSWERS.map((item) => (
          <article key={item.id} style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 10, background: '#fbfaf7', border: '1px solid #ebe6dd' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <strong>{item.question}</strong>
              <CopyButton text={`${item.question}\n\n${item.answer}`} />
            </div>
            <p style={{ margin: 0, whiteSpace: 'pre-line', color: '#374151' }}>{item.answer}</p>
          </article>
        ))}
      </section>

      <section style={{ border: '1px solid #d7d2c8', borderRadius: 12, background: '#fff', padding: 18, display: 'grid', gap: 14 }}>
        <h3 style={{ margin: 0 }}>Generar el informe de un cliente</h3>
        <label htmlFor="fiscal-client" style={{ display: 'grid', gap: 6, maxWidth: 360 }}>
          <span className="muted">Cliente</span>
          <select id="fiscal-client" value={clientId} onChange={(event) => setClientId(event.target.value)}>
            <option value="">Elige un cliente…</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.label}</option>)}
          </select>
        </label>
        {clientId && loading ? <p className="muted" style={{ margin: 0 }}>Cargando datos publicados…</p> : null}
        {clientId && !loading && !report ? <p className="muted" style={{ margin: 0 }}>Este cliente todavía no tiene cierres publicados.</p> : null}
        {clientId && report ? (
          <AnnualReturnsPanel
            key={clientId}
            source={report}
            commissions={commissions}
            holderName={holderName}
            clientCode={String(report.clientCode ?? clientId)}
            clientId={clientId}
          />
        ) : null}
      </section>
    </div>
  );
};
