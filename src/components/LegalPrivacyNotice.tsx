import React from 'react';

interface LegalPrivacyNoticeProps {
  required?: boolean;
  busy?: boolean;
  error?: string | null;
  onAccept: () => void;
  onClose?: () => void;
}

export function LegalPrivacyNotice({
  required = false,
  busy = false,
  error = null,
  onAccept,
  onClose
}: LegalPrivacyNoticeProps) {
  return (
    <div className="legal-notice-backdrop" role="presentation">
      <section className="legal-notice-dialog" role="dialog" aria-modal="true" aria-labelledby="legal-notice-title">
        <header className="legal-notice-header">
          <div>
            <span>Información legal</span>
            <h2 id="legal-notice-title">Privacidad y tecnologías de almacenamiento</h2>
            <p>Versión agosto de 2026</p>
          </div>
          {!required && onClose ? (
            <button type="button" onClick={onClose} aria-label="Cerrar información legal">×</button>
          ) : null}
        </header>

        <div className="legal-notice-intro">
          <strong>Información importante sobre el uso del portal</strong>
          <p>
            El tratamiento asociado al acceso, seguridad y analítica detallada del área de cliente se realiza conforme
            a la relación contractual y a la autorización incorporada a la documentación firmada. La confirmación
            inferior acredita la recepción y lectura de esta información; la analítica ya se encuentra habilitada.
          </p>
        </div>

        <div className="legal-notice-content">
          <details open>
            <summary>1. Responsable y ámbito de aplicación</summary>
            <div>
              <p>
                El responsable del tratamiento es <strong>JIGSA CAPITAL BROKERING - FZCO</strong>, con domicilio en
                Building A1, Dubai Digital Park, Dubai Silicon Oasis, Dubai, United Arab Emirates. Esta información
                se aplica al acceso y utilización del área privada, a sus informes, comunicaciones, registros de
                seguridad, soporte y funcionalidades relacionadas con la gestión y visualización de la cartera.
              </p>
            </div>
          </details>

          <details>
            <summary>2. Datos tratados</summary>
            <div>
              <p>
                Podrán tratarse datos identificativos y de contacto, usuario interno, cliente asociado, estado de la
                cuenta, información económica y financiera incorporada al servicio, aportaciones, retiradas,
                rendimientos, informes, comunicaciones y solicitudes de soporte. También se registran fecha y hora de
                acceso, duración aproximada de sesión, dispositivo, navegador, sistema operativo, resolución,
                idioma, zona horaria, tipo de conexión, descargas, errores de acceso y eventos de seguridad.
              </p>
              <p>
                La analítica funcional puede incluir secciones consultadas, tiempo aproximado de visualización,
                gráficos seleccionados, ampliaciones, periodos, filtros y detalles abiertos. No se registran
                contraseñas, contenido escrito antes de enviarlo, pulsaciones del teclado, GPS exacto ni actividad
                realizada fuera del portal.
              </p>
            </div>
          </details>

          <details>
            <summary>3. Finalidades y bases del tratamiento</summary>
            <div>
              <p>
                Los datos se utilizan para prestar y mantener el servicio contratado, mostrar información de cartera,
                generar informes, atender comunicaciones, autenticar usuarios, proteger cuentas, prevenir usos no
                autorizados, mantener trazabilidad operativa, resolver incidencias, mejorar la experiencia y analizar
                el funcionamiento del portal. Las bases aplicables incluyen la ejecución de la relación contractual,
                la autorización documentada, el cumplimiento de obligaciones aplicables y el interés legítimo en la
                seguridad, continuidad, defensa y mejora del servicio.
              </p>
            </div>
          </details>

          <details>
            <summary>4. Destinatarios, proveedores y transferencias</summary>
            <div>
              <p>
                El acceso queda limitado a personal autorizado y a proveedores tecnológicos necesarios para
                autenticación, alojamiento, almacenamiento, base de datos, seguridad, comunicaciones y generación de
                documentos. Estos proveedores actúan conforme a sus condiciones y medidas de seguridad. Debido a la
                naturaleza internacional de la entidad y de determinados proveedores, los datos pueden ser tratados
                fuera del país de residencia del cliente con las garantías contractuales y organizativas aplicables.
                No se venden datos personales ni se utilizan para publicidad comportamental de terceros.
              </p>
            </div>
          </details>

          <details>
            <summary>5. Conservación y seguridad</summary>
            <div>
              <p>
                La información se conserva mientras la relación permanezca activa y posteriormente durante los
                periodos necesarios para atender obligaciones, responsabilidades, reclamaciones, auditorías y defensa
                jurídica. Los registros técnicos y de seguridad podrán conservarse durante periodos proporcionados a
                su finalidad. Se aplican controles de acceso, autenticación, cifrado en tránsito, reglas de autorización,
                copias de seguridad y separación de información por cliente, sin que pueda garantizarse un riesgo cero.
              </p>
            </div>
          </details>

          <details>
            <summary>6. Derechos y comunicaciones</summary>
            <div>
              <p>
                El cliente puede solicitar información, acceso, rectificación, supresión, limitación u oposición cuando
                proceda, así como plantear cualquier consulta relacionada con privacidad a través de los canales
                habituales de comunicación mantenidos con la entidad o mediante comunicación dirigida al domicilio
                indicado. La solicitud podrá requerir verificación de identidad y quedará sujeta a las limitaciones y
                obligaciones legales aplicables.
              </p>
            </div>
          </details>

          <details>
            <summary>7. Cookies y almacenamiento local</summary>
            <div>
              <p>
                El portal utiliza cookies o tecnologías equivalentes estrictamente vinculadas a autenticación,
                mantenimiento de sesión, seguridad, prevención de duplicados y funcionamiento técnico. También puede
                utilizar almacenamiento local para recordar el usuario cuando el cliente lo selecciona, identificar de
                forma estable un dispositivo, conservar incidencias de acceso hasta el siguiente inicio correcto y
                mantener preferencias funcionales.
              </p>
              <p>
                La medición individual del uso autorizada contractualmente registra eventos funcionales en los sistemas
                del servicio. No se incorporan actualmente cookies publicitarias, redes de anuncios ni perfiles de
                navegación entre sitios. El usuario puede eliminar datos locales desde la configuración del navegador;
                hacerlo puede cerrar la sesión, borrar el usuario recordado o hacer que el dispositivo vuelva a
                identificarse como nuevo.
              </p>
            </div>
          </details>

          <details>
            <summary>8. Actualizaciones</summary>
            <div>
              <p>
                Esta información puede actualizarse por cambios normativos, contractuales, operativos o tecnológicos.
                Cuando una modificación sea relevante, se mostrará una nueva versión en el portal y podrá solicitarse
                una nueva confirmación de lectura.
              </p>
            </div>
          </details>
        </div>

        {error ? <p className="legal-notice-error" role="alert">{error}</p> : null}
        <footer className="legal-notice-actions">
          <p>Al continuar confirmas que has recibido y leído esta información.</p>
          <button type="button" onClick={onAccept} disabled={busy}>
            {busy ? 'Guardando...' : required ? 'Aceptar y continuar' : 'Cerrar'}
          </button>
        </footer>
      </section>
    </div>
  );
}
