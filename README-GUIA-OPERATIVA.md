# Guia tecnica y operativa - Portfolio Manager

Ultima revision de esta guia: 2026-02-20  
Base de codigo revisada: rama `main` (incluye hardening de enlaces de reportes y update de `jspdf`).

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

## 4.5 Reglas de seguridad

- `firestore.rules`
  - Control de permisos por rol y recurso.

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
- Incluye tablas y graficos.

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

No debe:

- Compartir credenciales.
- Usar navegador sin proteccion si hay datos reales.

## 10.2 Cliente (entra por `AuthShell` -> `ClientPortal`)

Puede:

- Ver solo su resumen (`clientId` asignado en access profile).
- Ver KPI, graficos, detalle mensual y movimientos.
- Descargar PDF.
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

