# Guia tecnica y operativa - Portfolio Manager

Ultima revision de esta guia: 2026-02-20  
Base de codigo revisada: rama `main` (incluye chat interno admin-cliente, respuestas rapidas editables y rediseno/paginacion de PDF cliente).

---

## 1) Objetivo de esta guia

Este documento sirve para que cualquier informatico pueda:

- Entender como funciona TODO el sistema sin depender de conocimiento previo.
- Saber donde esta cada pieza (archivo, modulo y servicio externo).
- Operar y desplegar cambios sin romper autenticacion, datos ni permisos.
- Auditar seguridad y detectar rapidamente que mejorar.

No es una guia de marketing. Es una guia tecnica de funcionamiento real.

---

## 2) Que es este proyecto (en una frase)

`portfolio-manager` es una app web React + Firebase para:

- Gestion interna de cartera por cliente (admin).
- Portal de lectura para cliente final (solo sus datos).
- Generacion y comparticion de informes PDF.

No hay backend propio Node/Express en produccion para esta app.  
La logica y datos dependen de Firebase (Auth + Firestore) y del cliente web.

---

## 3) Arquitectura completa

## 3.1 Frontend

- Framework: React 18 + TypeScript + Vite.
- Entry point: `src/main.tsx`.
- Shell de autenticacion y roles: `src/AuthShell.tsx`.
- Panel admin principal: `src/App.tsx`.
- Vistas de informes:
  - `src/components/InformesView.tsx`
  - `src/components/ReportView.tsx`

## 3.2 Persistencia de datos

### Firestore (nube)

Colecciones/documentos usados:

- `portfolio/state` (documento unico):
  - `finalByDay`
  - `movementsByClient`
- `portfolio_client_overviews/{clientId}`:
  - Resumen calculado por cliente para portal cliente.
- `access_profiles/{uid}`:
  - Rol de acceso (`admin` o `client`), `clientId`, `active`, etc.
- `reportLinks/{token}`:
  - Informes compartidos con expiracion.
- `support_threads/{clientId}`:
  - Hilo de mensajeria privada admin-cliente (resumen del hilo y contadores de no leido).
- `support_threads/{clientId}/messages/{messageId}`:
  - Mensajes del hilo, estado de lectura del cliente y marca de mensaje editado.

### Firebase Auth (nube)

- Login por email/password.
- Usuarios admin y usuarios cliente.

### LocalStorage (navegador admin)

Guardado local (no compartido automaticamente entre dispositivos):

- `portfolio-clients`
- `portfolio-contacts`
- `portfolio-guarantees`
- `portfolio-comisiones-cobradas`
- `portfolio-comision-estado`
- `portfolio-followup-by-client`
- `portfolio-followup-last-alert-date`
- `portfolio-comision-estado-retiro`
- `portfolio-admin-quick-templates` (plantillas de respuesta rapida del admin para mensajeria interna)

Importante: esto significa que una parte funcional (contactos, notas, etc.) es local al navegador.

## 3.3 Despliegue

- Hosting principal: Render Static Site.
- Config declarativa: `render.yaml`.
- Build en Render: `npm install && npm run build`.
- Publicacion: carpeta `dist`.

## 3.4 Config Firebase del repo

- Proyecto por defecto: `portfolio-manager-b40b8` (`.firebaserc`).
- Reglas e indices:
  - `firestore.rules`
  - `firestore.indexes.json`
  - `firebase.json`

---

## 4) Mapa de archivos (donde esta cada cosa)

## 4.1 Entrada y shell

- `src/main.tsx`
  - Renderiza `AuthShell`.
- `src/AuthShell.tsx`
  - Login UI.
  - Resolucion de rol (admin/client).
  - Control de sesion y logout.
  - Portal cliente (KPIs, graficos, PDF cliente).

## 4.2 App admin

- `src/App.tsx`
  - Navegacion lateral (General, Info Clientes, Comisiones, Informes, Estadisticas, Seguimiento).
  - Grilla diaria y panel por cliente.
  - CRUD basico de clientes.
  - Alta/vinculacion de login cliente.
  - Envio de reset password.
  - Mensajeria interna admin-cliente (buscador por cliente, no leidos, edicion de mensaje admin, plantillas rapidas CRUD).
  - Lectura de reportes por token.

## 4.3 Datos y calculo

- `src/store/portfolio.ts`
  - Store global (`zustand`) de movimientos y snapshot.
  - Persiste en Firestore y sincroniza resumenes por cliente.
- `src/utils/snapshot.ts`
  - Calculo base de balances/profits diarios y por cliente.
- `src/utils/twr.ts`
  - Calculo TWR y TWR mensual.
- `src/utils/format.ts`
  - Formatos moneda/porcentaje y parseo numerico.
- `src/utils/dates.ts`
  - Calendario, rango de anos y fecha foco.

## 4.4 Servicios Firebase

- `src/services/firebaseApp.ts`
  - Init Firebase app/auth/firestore.
- `src/services/cloudPortfolio.ts`
  - Lectura/escritura Firestore.
  - Calculo de overview para cliente.
  - Provision de usuarios cliente.
- `src/services/reportLinks.ts`
  - Tokens de enlace de informes.
  - Guardado/lectura de reportes con expiracion.
- `src/services/supportInbox.ts`
  - API de Firestore para hilos y mensajes internos.
  - Marcas de lectura (admin y cliente), edicion de mensaje admin y suscripciones realtime.

## 4.5 Reglas de seguridad

- `firestore.rules`
  - Control de permisos por rol y recurso.

## 4.6 Localizacion rapida (archivo + simbolo)

Nota: no fijamos numeros de linea en la guia porque cambian en cada commit.  
Para ir directo a la linea exacta usa `rg -n "<simbolo>" <archivo>`.

- Login visual:
  - archivo: `src/AuthShell.tsx`
  - simbolo: `LoginCard`
- Resolucion de rol/sesion:
  - archivo: `src/AuthShell.tsx`
  - simbolos: `ADMIN_EMAILS`, `SessionState`
- Portal cliente:
  - archivo: `src/AuthShell.tsx`
  - simbolo: `ClientPortal`
- PDF cliente:
  - archivo: `src/AuthShell.tsx`
  - simbolo: `downloadClientPdf`
- Chat cliente:
  - archivo: `src/AuthShell.tsx`
  - simbolos: `supportOpen`, `sendClientSupportMessage`, `markMessagesReadByClient`
- Chat admin:
  - archivo: `src/App.tsx`
  - simbolo: `AdminMessagesView`
- Plantillas rapidas admin:
  - archivo: `src/App.tsx`
  - simbolo: `QUICK_TEMPLATES_STORAGE_KEY`
- API Firestore chat:
  - archivo: `src/services/supportInbox.ts`
  - simbolos: `sendSupportMessage`, `editAdminSupportMessage`, `subscribeSupportThreads`, `subscribeSupportMessages`
- Provision perfiles y overviews:
  - archivo: `src/services/cloudPortfolio.ts`
  - simbolos: `fetchAccessProfile`, `subscribeClientOverview`, `syncClientOverviews`
- Reglas de seguridad:
  - archivo: `firestore.rules`
  - simbolos: `match /access_profiles/{uid}`, `match /portfolio_client_overviews/{clientId}`, `match /support_threads/{clientId}`, `match /reportLinks/{token}`

Comando rapido recomendado:

`rg -n "downloadClientPdf|AdminMessagesView|QUICK_TEMPLATES_STORAGE_KEY|support_threads|markMessagesReadByClient|sendSupportMessage" src firestore.rules`

---

## 5) Flujo de autenticacion y roles

## 5.1 Roles soportados

- `admin`
- `client`

No hay tercer rol.

## 5.2 Como detecta admin

En `AuthShell` hay dos vias:

1. Email incluido en allowlist hardcodeada:
   - `jibiza90@gmail.com`
   - `jpujola@alogroup.es`
2. Perfil Firestore `access_profiles/{uid}` con:
   - `role == 'admin'`
   - `active != false`

Si cumple cualquiera, entra como admin.

## 5.3 Como detecta cliente

Debe existir `access_profiles/{uid}` con:

- `role == 'client'`
- `active != false`
- `clientId` informado.

Si no cumple, se fuerza logout con mensaje:
"Tu usuario no tiene perfil activo. Contacta con el administrador."

## 5.4 Persistencia de sesion

- Se fija `Auth.Persistence.LOCAL`.
- Si Firebase emite un `user = null` transitorio, hay ventana de gracia antes de expulsar sesion.
- Logout manual limpia estado explicitamente.

---

## 6) Reglas Firestore (estado actual)

Archivo: `firestore.rules`.

Puntos clave:

- `access_profiles`:
  - read: admin o propio UID.
  - write: solo admin.
- `portfolio/*`:
  - read/write: solo admin.
- `portfolio_client_overviews/{clientId}`:
  - read: admin o cliente propietario.
  - write: solo admin.
- `reportLinks/{token}`:
  - read: solo si no expirado.
  - create/update: solo admin y con expiracion valida.
  - delete: solo admin.
- `support_threads/{clientId}`:
  - read: admin o cliente propietario del `clientId`.
  - create:
    - admin, o
    - cliente propietario si crea hilo propio y sube `adminUnreadCount` inicial.
  - update:
    - admin, o
    - cliente propietario sin poder bajar `adminUnreadCount`.
  - delete: solo admin.
- `support_threads/{clientId}/messages/{messageId}`:
  - read: admin o cliente propietario.
  - create:
    - admin (mensajes de admin), o
    - cliente propietario (mensajes cliente con `clientRead=true` al crear).
  - update:
    - admin (edicion de su mensaje), o
    - cliente propietario solo para marcar leido mensajes del admin.
  - delete: solo admin.
- Todo lo demas denegado por defecto.

---

## 7) Modelo de datos operativo

## 7.1 `portfolio/state`

Guarda estado fuente editable:

- `finalByDay`: saldo final por fecha.
- `movementsByClient`: increment/decrement por cliente y fecha.

## 7.2 `portfolio_client_overviews/{clientId}`

Se genera/sincroniza desde snapshot y contiene:

- saldo actual, beneficio acumulado, beneficio diario, participacion, etc.
- resumen mensual.
- TWR anual y mensual.
- filas de movimientos.

Este documento es lo que consume el portal cliente.

## 7.3 `access_profiles/{uid}`

Campos relevantes:

- `role`: `admin` o `client`
- `clientId`: obligatorio para clientes
- `displayName`
- `email`
- `active`
- `createdAt`, `updatedAt`

## 7.4 `reportLinks/{token}`

Documento temporal para compartir informe:

- Datos del informe renderizable.
- `createdAt`
- `expiresAt` (24h desde creacion).

## 7.5 `support_threads/{clientId}`

Cabecera del hilo interno por cliente:

- `clientId`, `clientName`, `clientEmail`
- `lastMessageText`, `lastMessageAt`, `updatedAt`
- `adminUnreadCount` (cuantos mensajes del cliente no han sido marcados como vistos por admin)
- `clientLastSeenAt` y `adminLastSeenAt` (cuando existe)

## 7.6 `support_threads/{clientId}/messages/{messageId}`

Mensaje individual del chat interno:

- `senderRole`: `admin | client`
- `senderName`
- `text`
- `createdAt`, `updatedAt`
- `clientRead`, `clientReadAt` (lectura del cliente para mensajes del admin)
- `edited` (si el admin lo modifico despues de enviar)

---

## 8) Calculo financiero (resumen tecnico)

## 8.1 Snapshot diario

En `src/utils/snapshot.ts`:

- `initial` diario = `previousFinal + netMovements`.
- `profit` diario = `effectiveFinal - initial`.
- `profitPct` diario = `profit / initial` (si `initial != 0`).

## 8.2 Distribucion por cliente

Para cada dia con final efectivo:

- Se calcula base por cliente (`baseBalance`).
- Peso cliente = `baseBalance / totalBase`.
- `shareAmount` cliente = `effectiveFinal * peso`.
- `clientProfit` = `shareAmount - baseBalance`.

## 8.3 TWR

En `src/utils/twr.ts`:

- Calcula retorno por periodo sin distorsion de flujos.
- TWR total = producto de `(1 + retorno_periodo)` menos 1.
- Se usa para YTD y para mensual.

---

## 9) Informes y PDF

## 9.1 Informe admin (compartible)

`InformesView`:

- Construye dataset por cliente.
- Crea token y guarda `reportLinks/{token}`.
- Genera URL compartible tipo `#report=TOKEN`.
- Abre Gmail con el enlace para envio manual.

## 9.2 Lectura de informe compartido

`App.tsx` + `ReportView.tsx`:

- Detecta token en query/hash.
- Valida formato de token.
- Lee `reportLinks` y rechaza expirados/no validos.

## 9.3 PDF en portal cliente

En `AuthShell` (vista cliente):

- Descarga PDF personalizado sin mostrar ID interno.
- Incluye bloque de KPIs en tarjetas (2 columnas), `Detalle mensual` y `Ingresos y retiradas`.
- Prioriza mantener KPI + tablas en una sola pagina cuando caben; si no, corta por bloque para no romper visualmente.
- Incluye graficos en paginas separadas con tabla de datos bajo cada grafico.

## 9.4 Mensajeria interna admin-cliente

Flujo operativo:

- Cliente:
  - abre su panel y escribe en su hilo.
  - ve notificacion persistente hasta abrir el hilo cuando hay respuesta del admin.
  - no ve estado "leido/no leido" del lado admin.
- Admin:
  - vista `Mensajes` en `App.tsx` con buscador de clientes.
  - orden de lista: prioridad por no leido, luego actividad reciente, luego numero de cliente.
  - puede escribir aunque el cliente no haya iniciado hilo.
  - puede marcar hilo como visto (pone `adminUnreadCount=0`).
  - puede editar mensajes enviados por admin (no mensajes del cliente).
  - tiene gestor CRUD de respuestas rapidas (guardadas en localStorage del navegador admin).

---

## 10) Admin vs Cliente: permisos y UX

## 10.1 Admin (entra por `AuthShell` -> `App`)

Puede:

- Editar valores de cartera (segun vistas).
- Crear/eliminar clientes en lista local.
- Gestionar datos de contacto.
- Crear o vincular login cliente.
- Enviar reset password.
- Generar enlaces de informes.
- Gestionar mensajeria interna:
  - enviar mensajes a cualquier cliente,
  - marcar hilos como vistos,
  - ver confirmacion de lectura del cliente en mensajes del admin,
  - editar mensajes propios,
  - administrar plantillas rapidas (anadir/editar/borrar).

No debe:

- Compartir credenciales.
- Usar navegador sin proteccion si hay datos reales.

## 10.2 Cliente (entra por `AuthShell` -> `ClientPortal`)

Puede:

- Ver solo su resumen (`clientId` asignado en access profile).
- Ver KPI, graficos, detalle mensual y movimientos.
- Descargar PDF.
- Usar chat interno para escribir al admin y leer respuestas.
- Cerrar sesion.

No puede:

- Editar datos globales.
- Ver otros clientes.

---

## 11) GitHub + Render + Firebase: como se conecta todo

## 11.1 GitHub

Repositorio (segun despliegue Render): `jibiza90/portfolio-manager`.

Flujo habitual:

1. Cambios locales.
2. `git add`, `git commit`, `git push` a `main`.
3. Render detecta nuevo commit y rebuild de static site.

## 11.2 Render

Fuente: `render.yaml`.

- Tipo: `static`.
- Build command: `npm install && npm run build`.
- Publish path: `dist`.

Importante:

- Cambios de codigo web se publican por Render.
- Cambios de reglas Firestore NO se publican por Render.

## 11.3 Firebase

Cambios de reglas requieren deploy manual:

- `npx firebase-tools deploy --only firestore:rules`

No hacer esto implica que el frontend y las reglas pueden quedar desalineadas.

---

## 12) Runbook: tareas operativas frecuentes

## 12.1 Levantar entorno local

1. `npm install`
2. `npm run dev`

## 12.2 Build de verificacion

1. `npm run build`
2. Revisar warnings/errores de compilacion.

## 12.3 Publicar a produccion

1. Commit y push a `main`.
2. Verificar deploy en Render.
3. Si tocaste `firestore.rules`, desplegar reglas via Firebase CLI.

## 12.4 Dar alta a cliente nuevo con acceso

Opciones:

- Desde UI admin (Info Clientes):
  - poner email
  - definir password
  - "Crear / Vincular login"
- Desde Firebase Console + `access_profiles`.

Sin `access_profiles` correcto, el usuario no entra aunque exista en Auth.

## 12.5 Dar alta a admin nuevo

Hay dos caminos:

- Rapido (acoplado a codigo): anadir email en allowlist de `AuthShell` y en reglas.
- Recomendado: usar `access_profiles/{uid}` con `role='admin'` y `active=true`.

En cualquier caso, validar acceso en frontend y permisos en Firestore.

---

## 13) Seguridad: estado actual y superficie de ataque

## 13.1 Controles ya aplicados

- Reglas Firestore cerradas por rol.
- Report links con expiracion obligatoria.
- Token de reportes criptograficamente fuerte.
- Token de reporte validado antes de lectura.
- URL de reporte movida a hash para reducir fuga de referrer.
- Meta `referrer=no-referrer`.
- `jspdf` actualizado para eliminar advisories conocidas de produccion.

## 13.2 Riesgos tecnicos actuales

1) Parte de datos operativos en localStorage (contactos/notas/comisiones/seguimiento).
   - Riesgo: no centralizado, sensible a XSS/dispositivo.

2) Provision de usuarios cliente desde frontend.
   - Riesgo: logica de alta en cliente, menos robusta que Admin SDK server-side.

3) Allowlist admin hardcodeada en frontend.
   - Riesgo: mantenimiento y control de cambios menos limpio.

4) Fuente Google Fonts remota.
   - Riesgo de dependencias externas y posibles fugas de metadata de navegacion.

5) Warnings de build por orden `@import` CSS.
   - No rompe seguridad, pero conviene limpiar.

## 13.3 Escenarios de entrada de tercero

- Robo de credenciales (phishing/reutilizacion password).
- Sesion abierta en equipo no seguro.
- Mal uso de cuenta admin legitima (insider risk).
- Exposicion de datos locales del navegador en equipos compartidos.

---

## 14) Mejoras recomendadas (clasificadas)

## 14.1 Gratis (alta prioridad)

1. Quitar debug logs de hooks (`useFocusDate`) para evitar ruido/filtrado accidental.
2. Migrar contactos/notas/comisiones/seguimiento de localStorage a Firestore.
3. Consolidar admin solo por `access_profiles` (retirar hardcode email en frontend).
4. Endurecer politica password en UI (longitud + complejidad minima).
5. Desactivar proveedor anonimo en Firebase Auth si esta habilitado y no se usa.

## 14.2 No gratis / con coste potencial

1. Backend seguro (Cloud Functions/Admin SDK) para alta/reset usuarios.
2. App Check estricto.
3. MFA fuerte para admins (evitar solo password).
4. Observabilidad/alertas de seguridad mas avanzadas.

---

## 15) Que revisar cuando "algo no funciona"

## 15.1 "No puedo entrar"

Checklist:

- Usuario existe en Firebase Auth.
- Password correcta.
- Documento `access_profiles/{uid}` existe.
- `active != false`.
- Rol correcto (`admin` o `client`).
- Reglas Firestore desplegadas y vigentes.

## 15.2 "Cliente entra pero no ve datos"

- Existe `portfolio_client_overviews/{clientId}`.
- `clientId` del perfil coincide exactamente.
- Sync de overviews ejecutada correctamente.

## 15.3 "Admin entra y le expulsa"

- Revisar estados transitorios de Auth (red/token refresh).
- Confirmar que UID mantiene perfil admin activo.
- Confirmar email normalizado y/o perfil admin valido.

## 15.4 "Enlace de informe no abre"

- Token invalido o expirado.
- Regla de `reportLinks` denegando por expiracion.
- URL cortada al copiar.

---

## 16) Relacion entre vistas funcionales

- `General`:
  - Vision agregada del portfolio.
- `Info Clientes`:
  - Datos de contacto, garantia, acceso cliente, notas.
- `Comisiones`:
  - Estado de cobro y importes.
- `Informes`:
  - Reporte premium, PDF, enlace compartible.
- `Estadisticas`:
  - Analitica agregada de clientes.
- `Seguimiento`:
  - Tareas y recordatorios por cliente.

Todas estas vistas son admin-only porque `App` solo se monta en sesion admin.

---

## 17) Observaciones de mantenimiento

1. Hay un script local `scripts/schedule-launch-plan.ts` que no corresponde al dominio de esta app (portfolio).  
   Recomendado: sacarlo de este repo o moverlo a repo correcto para evitar confusion.

2. Existen archivos con texto mal codificado en algunos mensajes (`Ã` etc).  
   Recomendado: normalizar encoding UTF-8 sin BOM en todo el repo.

3. No hay script `npm run lint` en `package.json`.  
   Recomendado: agregar lint para control de calidad continuo.

---

## 18) Checklist de traspaso a otro informatico

Entregar junto a esta guia:

- URL de produccion Render.
- Acceso Firebase project `portfolio-manager-b40b8`.
- Acceso GitHub repo `portfolio-manager`.
- Lista de admins autorizados.
- Proceso oficial para altas/bajas de clientes.
- Proceso oficial para publicar cambios (code + reglas).

Validar en reunion de handover:

- Login admin correcto.
- Login cliente correcto.
- Generacion PDF.
- Lectura por enlace de reporte.
- Deploy rules Firebase.
- Deploy Render por push a main.

---

## 19) Comandos de referencia

- Instalar deps: `npm install`
- Desarrollo: `npm run dev`
- Build: `npm run build`
- Deploy rules: `npx firebase-tools deploy --only firestore:rules`
- Ver proyecto Firebase activo: `npx firebase-tools use`

---

## 20) Resumen ejecutivo final

El sistema funciona y esta operativo, con una base de seguridad razonable para su arquitectura actual (frontend + Firebase).  
El mayor punto a mejorar no es UI: es centralizar en nube la parte que hoy vive en localStorage y mover gestion de usuarios sensibles a backend seguro.

Si un tercero tecnico entra hoy al proyecto con esta guia, puede:

- Navegar el codigo por modulos rapidamente.
- Entender roles, datos, reglas y despliegue.
- Ejecutar mantenimiento sin improvisar.
- Priorizar mejoras con criterio tecnico.

---

## 21) FAQ tecnica completa (para informatico)

Esta FAQ esta pensada para resolver dudas reales de mantenimiento, seguridad, despliegue y evolucion del sistema.

## 21.1 Arquitectura y alcance

### Q1) Esta app tiene backend propio?
A: No hay backend custom (Express/Nest) en produccion para esta app.  
La app es frontend React desplegada en Render Static + Firebase (Auth + Firestore).

### Q2) Donde empieza la ejecucion de la app?
A: En `src/main.tsx`, que renderiza `AuthShell`.

### Q3) Quien decide si un usuario ve panel admin o portal cliente?
A: `src/AuthShell.tsx` en `onAuthStateChanged`.

### Q4) Si quiero cambiar el flujo de login, donde toco?
A: En `src/AuthShell.tsx`, componentes `LoginCard` y logica de `handleLogin`/`handleLogout`.

### Q5) El panel admin y el portal cliente comparten codigo?
A: Comparten shell de sesion (`AuthShell`), pero vistas principales son distintas:
- Admin -> `src/App.tsx`
- Cliente -> `ClientPortal` dentro de `src/AuthShell.tsx`

### Q6) Hay rutas tipo React Router?
A: No. Se usa render condicional por estado.

### Q7) Como se abre un informe compartido?
A: Por token en URL (`#report=...` o `?report=...`), parseado en `src/App.tsx`.

### Q8) Que modulo dibuja PDF de cliente?
A: `downloadClientPdf` en `src/AuthShell.tsx`.

### Q9) Que modulo dibuja PDF de informes compartidos?
A: `generatePDF`/`handleDownload` en `src/components/InformesView.tsx` y `src/components/ReportView.tsx`.

### Q10) Que parte calcula KPIs y balances diarios?
A: `src/utils/snapshot.ts` + store `src/store/portfolio.ts`.

---

## 21.2 Roles, Auth y acceso

### Q11) Que roles existen?
A: Solo `admin` y `client`.

### Q12) Donde se guarda el rol real?
A: En Firestore `access_profiles/{uid}` (`role`, `active`, `clientId`).

### Q13) Por que hay admins hardcodeados en frontend?
A: Por compatibilidad operativa rapida.  
Esta en `src/AuthShell.tsx` (`ADMIN_EMAILS`).  
Recomendacion: migrar 100% a `access_profiles`.

### Q14) Si borro un email del allowlist hardcodeado, deja de ser admin?
A: Si no tiene perfil admin en Firestore, si.

### Q15) Si un usuario existe en Firebase Auth pero no en `access_profiles`, entra?
A: No. Se rechaza y se hace `signOut`.

### Q16) Como se crea un cliente con acceso?
A: Desde Info Clientes (admin):
- rellenar email
- definir password
- usar "Crear / Vincular login"

### Q17) Si el email ya existe en Auth, que hace el sistema?
A: Intenta vincular perfil existente en `access_profiles`.

### Q18) Donde esta la logica de alta/vinculacion?
A: `provisionClientAccess` en `src/services/cloudPortfolio.ts`.

### Q19) Como se hace reset de password?
A: Desde admin, boton que llama `auth.sendPasswordResetEmail`.

### Q20) Hay MFA obligatoria ahora mismo?
A: No a nivel codigo. Se configura desde Firebase Auth/Identity Platform.

### Q21) Se mantiene sesion al recargar pagina?
A: Si, con persistencia LOCAL.

### Q22) Por que antes se cerraba sesion de admin sola?
A: Por eventos transitorios `user=null`/claims incompletas.  
Se mitigo con ventana de gracia + cache de UID admin validado.

### Q23) Como desactivo un cliente sin borrarlo?
A: En `access_profiles/{uid}`, poner `active=false`.

### Q24) Como revoco acceso admin inmediato?
A:
1. Quitar role admin en `access_profiles`.
2. (Opcional) quitar email de `ADMIN_EMAILS` hardcode.
3. Forzar cambio de password si procede.

### Q25) Un cliente puede ver datos de otro cliente?
A: No, por regla `clientOwns(clientId)` en `firestore.rules`.

---

## 21.3 Firestore, datos y reglas

### Q26) Cual es la fuente de verdad de cartera?
A: `portfolio/state` (doc unico).

### Q27) Que contiene `portfolio/state`?
A:
- `finalByDay`
- `movementsByClient`

### Q28) Que contiene `portfolio_client_overviews`?
A: Resumen precomputado por cliente para consumo rapido del portal cliente.

### Q29) Quien escribe `portfolio_client_overviews`?
A: Logica admin en `syncClientOverviews`.

### Q30) Que es `reportLinks`?
A: Enlaces temporales de informe con payload y expiracion.

### Q31) Como se valida expiracion de `reportLinks`?
A:
- En cliente (`getReportByToken`) y
- En regla Firestore (`expiresAt > request.time.toMillis()`).

### Q32) Puedo leer `reportLinks` sin login?
A: Si, pero solo si no expirado y con token valido.

### Q33) Por que se permite lectura publica de `reportLinks`?
A: Porque es un enlace compartible por token.  
El control es token fuerte + expiracion.

### Q34) Como desplegar reglas nuevas?
A: `npx firebase-tools deploy --only firestore:rules`

### Q35) Si hago push a GitHub, se actualizan reglas?
A: No. Render no despliega reglas Firebase.

### Q36) Que pasa si frontend espera una regla nueva pero no se deployo?
A: Fallos `permission-denied` en runtime.

### Q37) Hay indices Firestore custom?
A: Definidos en `firestore.indexes.json`.

### Q38) Hay TTL automatico nativo para `reportLinks`?
A: No en este flujo. La expiracion se aplica por regla + borrado al leer expirado.

### Q39) Como limpiar reportes expirados en masa?
A: Actualmente no hay job dedicado.  
Mejora recomendada: tarea programada de limpieza.

### Q40) Se puede romper el sistema si se borra `portfolio/state`?
A: No rompe app, pero pierde estado operativo remoto hasta nueva escritura.

---

## 21.4 LocalStorage y consistencia

### Q41) Que datos no estan en Firestore ahora mismo?
A: Parte de contactos, garantias, comisiones y seguimiento en `localStorage`.

### Q42) Riesgo de usar localStorage aqui?
A:
- No sincroniza entre dispositivos.
- Riesgo si hay XSS/compromiso local.
- Dificulta trazabilidad centralizada.

### Q43) Si dos admins usan dos PCs distintos, ven lo mismo?
A: No necesariamente para lo guardado en localStorage.

### Q44) Como detectar si algo viene de localStorage y no de nube?
A: Buscar `localStorage.getItem/setItem` en `src/App.tsx` y `src/constants/clients.ts`.

### Q45) Recomendacion tecnica?
A: Migrar esos bloques a Firestore con esquema versionado.

---

## 21.5 Reportes, tokens y comparticion

### Q46) Como se genera token de reporte?
A: Con Web Crypto (`crypto.getRandomValues`) en `src/services/reportLinks.ts`.

### Q47) Longitud/formato token esperado?
A: Regex `^[A-Za-z0-9_-]{43}$`.

### Q48) Por que antes era debil?
A: Porque usaba `Math.random`; ya corregido.

### Q49) Por que se usa `#report=` y no `?report=`?
A: Para reducir fuga de token por cabecera `Referer`.

### Q50) Si alguien pierde el token, que puede hacer?
A: Esperar expiracion o borrar doc en `reportLinks`.

### Q51) Cuanto dura un enlace?
A: 24 horas desde `createdAt`.

### Q52) Se puede cambiar duracion?
A: Si, modificando `saveReportLink` (calculo de `expiresAt`) y manteniendo coherencia con reglas.

### Q53) Si copio mal el token, que muestra?
A: Reporte expirado/no valido (`ReportView` lo marca como no disponible).

### Q54) Se puede forzar acceso con fuerza bruta de tokens?
A: Teoricamente con cualquier sistema por token, pero aqui el espacio es alto (32 bytes random -> base64url) y expiracion corta.

### Q55) Se pueden invalidar todos los tokens activos?
A: Si, borrando coleccion `reportLinks` o ajustando regla temporal para bloquear lectura.

---

## 21.6 Render y despliegue

### Q56) Que hace Render al desplegar?
A:
1. Clona repo.
2. Ejecuta build command.
3. Publica `dist`.

### Q57) Donde esta esa configuracion?
A: `render.yaml`.

### Q58) Que provoca un redeploy?
A: Push a `main` (si autodeploy activo) o deploy manual en panel Render.

### Q59) Si falla build en Render, que revisar primero?
A:
- `npm run build` local
- version de Node
- errores de TypeScript/Vite

### Q60) El deploy de Render toca Firebase?
A: No.

### Q61) Necesito variables de entorno en Render para este proyecto?
A: No para Firebase web config actual (esta en codigo).

### Q62) Eso de tener firebase config en codigo es inseguro?
A: No por si solo. Es normal en web Firebase.  
La seguridad real depende de reglas y Auth.

### Q63) Como rollback rapido en Render?
A: Desde panel de eventos/deploys, usar rollback a commit previo.

---

## 21.7 GitHub y flujo de cambios

### Q64) Que rama publica hoy?
A: `main`.

### Q65) Hay release tags?
A: No obligatorio actualmente.

### Q66) Flujo minimo recomendado para cambios delicados?
A:
1. branch feature
2. build local
3. commit atomico
4. PR
5. merge a main
6. deploy reglas si aplica

### Q67) Como saber si un cambio requiere deploy de reglas?
A: Si toca `firestore.rules`.

### Q68) Como saber si un cambio requiere migracion de datos?
A: Si cambia forma de `portfolio/state`, `access_profiles` o `reportLinks`.

### Q69) Que deberia protegerse en GitHub?
A:
- branch protection
- required reviews
- 2FA
- no force-push en `main`

### Q70) Que NO debe commitearse nunca?
A:
- credenciales privadas
- export de datos de clientes
- backups sin anonimizar

---

## 21.8 Seguridad practica (preguntas criticas)

### Q71) Cual es hoy el mayor riesgo tecnico?
A: Datos operativos en localStorage y provision de usuarios desde frontend.

### Q72) Un atacante puede escribir en `portfolio/state` sin ser admin?
A: No, segun reglas actuales.

### Q73) Puede crear `access_profiles` sin permisos?
A: No, solo admin.

### Q74) Puede leer un `overview` de otro cliente?
A: No, salvo ser admin.

### Q75) Puede leer un informe si adivina token valido y no expirado?
A: Si. Ese es el modelo de enlace compartido.

### Q76) Como reducir ese riesgo sin coste?
A:
- bajar expiracion (ej 6h)
- invalidar tras primer uso (one-time token)
- rotar/limitar distribucion de enlaces

### Q77) El sistema audita quien ha leido un reporte?
A: No actualmente.

### Q78) Se registra historial de cambios de cartera?
A: No hay auditoria completa versionada hoy.

### Q79) Hay proteccion anti-CSRF?
A: No hay backend session cookie propio; el acceso va por Firebase SDK + reglas.

### Q80) Hay proteccion contra XSS?
A: No hay capa CSP fuerte definida en headers aun; se recomienda añadirla.

### Q81) Hay `Referrer-Policy`?
A: Si, meta `no-referrer` en `index.html`.

### Q82) Hay App Check?
A: No implementado en codigo actual.

### Q83) Hay limitacion de intentos de login?
A: Firebase aplica controles, y UI muestra `too-many-requests`.

### Q84) Se usa password policy fuerte?
A: Minimo funcional; mejorable.

### Q85) Que hacer si sospechas compromiso de admin?
A:
1. revocar role admin
2. reset password
3. revisar `access_profiles`
4. invalidar `reportLinks`
5. revisar deploys recientes

---

## 21.9 Troubleshooting avanzado

### Q86) "Login correcto pero vuelve al login"
A:
- revisar `AuthShell` (persistencia y onAuthStateChanged)
- verificar perfil activo
- mirar consola errores Firebase

### Q87) "Cliente sin datos en portal"
A:
- `access_profiles.clientId`
- existencia de `portfolio_client_overviews/{clientId}`
- sync de overviews desde admin

### Q88) "PDF no descarga"
A:
- revisar carga dinamica `jspdf`
- consola del navegador
- bloqueadores popup en algunos flujos

### Q89) "Informe compartido abre expirado aunque acabo de crearlo"
A:
- reloj local desfasado
- `expiresAt` mal guardado
- reglas no desplegadas o desalineadas

### Q90) "No puedo crear login cliente"
A:
- email invalido
- password corta
- usuario existente sin perfil vinculable
- error Auth quota/permiso

### Q91) "Admin puede entrar pero no guardar cambios"
A:
- `canWrite` no activo
- error Firestore write permission
- fallo red durante `savePortfolioState`

### Q92) "Cambios en codigo no aparecen en web"
A:
- no se hizo push
- Render no redeployo
- cache navegador
- deploy fallido

### Q93) "Reglas nuevas no aplican"
A:
- no deployado `firestore.rules`
- proyecto Firebase incorrecto en CLI

---

## 21.10 Operacion diaria y buenas practicas

### Q94) Como operar sin romper nada?
A:
1. cambios pequenos
2. build local
3. commit claro
4. push
5. verificar app
6. si hay reglas, deploy reglas

### Q95) Que chequear despues de cada release?
A:
- login admin
- login cliente
- lectura de overview
- PDF descarga
- informe compartido abre

### Q96) Conviene tener entorno staging?
A: Si, recomendado para cambios de reglas y auth.

### Q97) Como preparar handover limpio?
A:
- esta guia
- accesos controlados
- runbook de incidentes
- checklist de release

### Q98) Que monitorizacion minima falta?
A:
- errores frontend centralizados
- metricas de fallos auth
- metricas de Firestore denegados

### Q99) Que deuda tecnica esta aceptada hoy?
A:
- localStorage como capa operativa parcial
- ausencia de backend admin seguro
- falta de auditoria completa

### Q100) Si me piden "dejarlo enterprise", por donde empiezo?
A:
1. backend admin (Admin SDK)
2. migrar localStorage a Firestore
3. auditoria y logging central
4. MFA + App Check + CSP
5. pipeline CI/CD + pruebas automatizadas

---

## 21.11 FAQ de "si te pido X, donde tocas"

### Q101) "Quiero agregar un admin nuevo"
A:
- `access_profiles/{uid}` -> role admin, active true
- opcional temporal: `ADMIN_EMAILS` en `AuthShell`
- validar reglas y login

### Q102) "Quiero bloquear un cliente ya"
A:
- `access_profiles/{uid}.active=false`

### Q103) "Quiero cambiar formula de KPI"
A:
- `src/utils/snapshot.ts` y/o `src/utils/twr.ts`
- revisar impacto en PDF y overview

### Q104) "Quiero cambiar estilo login"
A:
- `LoginCard` en `src/AuthShell.tsx` + `src/index.css` si procede

### Q105) "Quiero cambiar tabs del panel admin"
A:
- constantes de vistas y render condicional en `src/App.tsx`

### Q106) "Quiero cambiar formato PDF cliente"
A:
- `downloadClientPdf` en `src/AuthShell.tsx`

### Q107) "Quiero cambiar formato PDF de informe compartido"
A:
- `src/components/InformesView.tsx` y `src/components/ReportView.tsx`

### Q108) "Quiero acortar expiracion de enlaces"
A:
- `src/services/reportLinks.ts` (`expiresAt`)
- desplegar/revisar reglas

### Q109) "Quiero desactivar enlaces compartidos"
A:
- bloquear `reportLinks` read en reglas
- ocultar UI de envio en `InformesView`

### Q110) "Quiero que TODO quede centralizado en nube"
A:
- eliminar dependencias de localStorage
- persistir contactos/comisiones/seguimiento en Firestore
- definir migracion de datos local->cloud

---

## 21.12 FAQ de seguridad pura (preguntas incomodas)

### Q111) "Puedo garantizar seguridad total?"
A: No. Ningun sistema web puede garantizar 0 riesgo.  
Se trabaja con reduccion de superficie y controles compensatorios.

### Q112) "Si alguien roba un email admin pero no password, entra?"
A: No, salvo ataque de reset comprometido o reuse de credenciales.

### Q113) "Si alguien roba password admin, entra?"
A: Si no hay MFA, si.

### Q114) "Si alguien filtra un link de reporte, que ve?"
A: El contenido de ese reporte mientras no expire.

### Q115) "Si Render cae, se pierden datos?"
A: No por caida de static host; datos persisten en Firestore.

### Q116) "Si Firestore cae, la app funciona?"
A: UI carga, pero lectura/escritura de datos quedara degradada.

### Q117) "Hay backup automatico de Firestore?"
A: No definido en codigo. Se gestiona en GCP/Firebase.

### Q118) "Hay cifrado en reposo y en transito?"
A: En Firebase si (plataforma). A nivel app no hay cifrado app-layer adicional.

### Q119) "Es suficiente para datos muy sensibles?"
A: Para nivel alto regulado, no. Falta hardening enterprise adicional.

### Q120) "Que evidencia doy a auditor externo?"
A:
- reglas Firestore vigentes
- flujos de rol
- historial de deploys
- esta guia + runbooks

---

## 21.13 FAQ de calidad y mantenimiento continuo

### Q121) "Como evitar roturas silenciosas?"
A:
- tests unitarios para snapshot/twr
- smoke tests de login/roles
- checklist release obligatorio

### Q122) "Hay lint/CI ahora?"
A: Lint script no definido en package actual.

### Q123) "Que deuda hay en encoding?"
A: Hay textos con codificacion heredada rara (`Ã` etc) en algunos archivos.

### Q124) "Hay codigo fuera de dominio en el repo?"
A: Ahora no hay scripts heredados activos fuera de dominio en `scripts/` (directorio limpio).

### Q125) "Que hago primero si tomo mantenimiento?"
A:
1. leer esta guia
2. verificar accesos
3. ejecutar build local
4. revisar reglas Firestore
5. mapear localStorage pendiente de migracion

### Q126) "Donde se implementa el chat interno admin-cliente?"
A:
- UI admin: `AdminMessagesView` en `src/App.tsx`
- UI cliente: bloque de mensajes en `ClientPortal` dentro de `src/AuthShell.tsx`
- Persistencia y realtime: `src/services/supportInbox.ts`
- Seguridad: `support_threads` y subcoleccion `messages` en `firestore.rules`

### Q127) "El cliente puede editar mensajes?"
A: No. Solo el admin puede editar mensajes enviados por el admin.

### Q128) "Donde se guardan las respuestas rapidas del admin?"
A: En localStorage del navegador admin (`portfolio-admin-quick-templates`).

### Q129) "Como se marca un mensaje como leido?"
A:
- Cliente: al abrir su panel de mensajes, se marca lectura de mensajes admin (`clientRead=true`).
- Admin: usa boton `Marcar visto` para poner `adminUnreadCount=0` en el hilo.

### Q130) "Por que a veces el PDF cambia de pagina antes de lo esperado?"
A:
- El PDF intenta juntar bloques KPI + tablas cuando caben.
- Si el alto estimado supera el espacio util, se mueve el bloque completo para no partirlo visualmente.
