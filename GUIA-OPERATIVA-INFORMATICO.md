# Guia operativa para informatico - Portfolio Manager

Fecha: 2026-02-20

Este documento es la version operativa para una persona tecnica que tiene que mantener, desplegar, auditar y evolucionar el sistema.

No reemplaza `README-GUIA-OPERATIVA.md`; lo complementa como manual de ejecucion y control.

---

## 1. Objetivo practico

Con esta guia debes poder:

- levantar entorno local sin friccion,
- entender arquitectura y limites actuales,
- operar incidentes de login/datos/permisos,
- desplegar cambios de forma segura,
- validar seguridad minima antes de publicar,
- planificar mejoras tecnicas sin romper negocio.

---

## 2. Stack real y limites del sistema

## 2.1 Stack

- Frontend: React + TypeScript + Vite.
- Persistencia cloud: Firebase Auth + Firestore.
- Hosting: Render (Static Site).
- Estado local adicional: localStorage (parte admin).

## 2.2 Limite clave

No hay backend privado propio para operaciones criticas.

Consecuencias:

- parte de control de usuarios esta en frontend,
- parte de datos operativos no esta centralizada en Firestore,
- seguridad depende mucho de reglas Firestore y disciplina operativa.

---

## 3. Mapa tecnico rapido (archivo -> responsabilidad)

- `src/main.tsx`: bootstrap React.
- `src/AuthShell.tsx`: login, sesion, resolucion de rol, portal cliente.
- `src/App.tsx`: panel admin completo.
- `src/store/portfolio.ts`: store global + persistencia + sync.
- `src/utils/snapshot.ts`: calculo diario y por cliente.
- `src/utils/twr.ts`: TWR anual/mensual.
- `src/services/firebaseApp.ts`: init Firebase.
- `src/services/cloudPortfolio.ts`: acceso Firestore + provision cliente.
- `src/services/reportLinks.ts`: enlaces de informe (token + expiracion).
- `src/components/InformesView.tsx`: generar y compartir informes.
- `src/components/ReportView.tsx`: visualizar enlace de informe.
- `firestore.rules`: autorizacion real de datos.
- `render.yaml`: despliegue Render.

---

## 4. Modelo de datos y contratos

## 4.1 Documento fuente

`portfolio/state`

- `finalByDay: Record<isoDate, number|undefined>`
- `movementsByClient: Record<clientId, Record<isoDate, {increment?, decrement?}>>`

Este documento es la base para recalculo de snapshots y resumenes.

## 4.2 Overview por cliente

`portfolio_client_overviews/{clientId}`

Incluye:

- saldo actual,
- beneficio acumulado,
- incrementos/decrementos totales,
- resumen mensual,
- twr anual/mensual,
- filas de movimientos para UI cliente.

## 4.3 Perfil de acceso

`access_profiles/{uid}`

- `role: "admin" | "client"`
- `clientId` (obligatorio en cliente)
- `active: boolean`
- `displayName`, `email`
- timestamps

## 4.4 Enlace de reporte

`reportLinks/{token}`

- payload del informe,
- `createdAt`,
- `expiresAt`.

Token fuerte, formato validado y expiracion controlada en cliente + reglas.

---

## 5. Flujo de autenticacion (operativo)

## 5.1 Entrada

`AuthShell` escucha `onAuthStateChanged`.

## 5.2 Resolucion de rol

Orden efectivo:

1) Email en allowlist frontend (`ADMIN_EMAILS`), o
2) Perfil `access_profiles` con `role=admin` activo, o
3) Perfil `access_profiles` con `role=client` + `clientId`.

Sin perfil valido -> logout forzado.

## 5.3 Sesion

- Persistencia: `LOCAL`.
- Mitigacion de cortes transitorios: gracia antes de expulsar.
- Cache de UID admin validado para evitar logout por claims transitorias.

---

## 6. Matriz de permisos (Firestore)

Definicion en `firestore.rules`.

- `access_profiles/*`:
  - read: admin o propio UID.
  - write: solo admin.
- `portfolio/*`:
  - read/write: solo admin.
- `portfolio_client_overviews/*`:
  - read: admin o cliente propietario.
  - write: solo admin.
- `reportLinks/*`:
  - read: permitido solo si `expiresAt` no vencido.
  - create/update/delete: solo admin (con validacion de expiracion en create/update).
- default deny en el resto.

Regla operativa: cualquier cambio de reglas requiere deploy manual Firebase.

---

## 7. Runbook diario (operacion normal)

## 7.1 Arranque local

1. `npm install`
2. `npm run dev`
3. verificar login admin y cliente

## 7.2 Build pre-commit

1. `npm run build`
2. revisar warnings importantes

## 7.3 Publicacion

1. commit/push a `main`
2. revisar deploy Render
3. si tocaste reglas: `npx firebase-tools deploy --only firestore:rules`

## 7.4 Validacion minima post deploy

- login admin estable,
- login cliente estable,
- overview cliente visible,
- descarga PDF OK,
- enlace de informe abre y expira correctamente.

---

## 8. Runbook de incidencias

## 8.1 Incidencia: "admin entra y sale solo"

Checklist:

- revisar consola frontend (Auth errors),
- revisar `access_profiles/{uid}` admin activo,
- revisar allowlist email normalizado,
- validar conectividad/reautenticacion Firebase.

## 8.2 Incidencia: "cliente entra sin datos"

Checklist:

- `access_profiles.clientId` correcto,
- existe `portfolio_client_overviews/{clientId}`,
- sincronizacion overview ejecutada.

## 8.3 Incidencia: "permission-denied"

Checklist:

- regla desplegada?
- documento en coleccion correcta?
- rol y `active` correcto en `access_profiles`?
- reloj de expiracion en `reportLinks`?

## 8.4 Incidencia: "enlace de informe no abre"

Checklist:

- token valido (regex),
- token no expirado,
- URL completa,
- regla `reportLinks` vigente.

## 8.5 Incidencia: "no persisten cambios admin"

Checklist:

- `canWrite` true en sesion admin,
- escritura en Firestore permitida,
- errores de red en `savePortfolioState`.

---

## 9. Seguridad operativa: estado actual

## 9.1 Bien resuelto hoy

- reglas Firestore con deny-by-default,
- separacion admin/client por perfil + reglas,
- token de reportes criptografico,
- expiracion de reportes reforzada en reglas,
- `referrer=no-referrer`,
- `jspdf` actualizado.

## 9.2 Riesgos abiertos

1. Datos operativos en localStorage.
2. Provision de usuarios cliente desde frontend.
3. Allowlist admin hardcodeada en frontend.
4. Falta backend privado para acciones sensibles.
5. Sin App Check ni MFA obligatoria por codigo.

## 9.3 Impacto de riesgo (prioridad)

- Alto: acceso indebido por credenciales comprometidas admin.
- Medio/Alto: incoherencia de datos por localStorage multi-dispositivo.
- Medio: fuga de enlace de reporte durante ventana de vigencia.

---

## 10. Plan de mejora recomendado (orden de ejecucion)

## Fase 1 (sin coste / minima friccion)

1. Consolidar admin por `access_profiles` (eliminar hardcode progresivo).
2. Migrar bloques localStorage a Firestore.
3. Limpiar logs debug en hooks.
4. Normalizar encoding de textos.
5. Crear script lint y checklist release.

## Fase 2 (mas robustez)

1. Mover provision/reset de usuarios a backend seguro (Admin SDK).
2. Activar MFA admin.
3. Activar App Check.
4. Agregar auditoria de eventos (who/when/what).

---

## 11. Gobernanza de cambios

## 11.1 Regla de oro

No mezclar en el mismo commit:

- cambios de seguridad,
- cambios de UX,
- cambios de calculo financiero.

Hacer commits atomicos facilita rollback y auditoria.

## 11.2 Protocolo sugerido para cambios sensibles

1. branch dedicada,
2. build local limpio,
3. diff revisado,
4. pruebas funcionales clave,
5. merge,
6. deploy reglas si aplica,
7. smoke test en produccion.

---

## 12. FAQ operativa corta (alta frecuencia)

### "Donde creo o vinculo un cliente con login?"
En `Info Clientes` (admin), campo email + password + boton de provision.

### "Como bloqueo acceso de un cliente sin borrar cuenta Auth?"
`access_profiles/{uid}.active=false`.

### "Como doy admin a alguien?"
Setear `role=admin` en `access_profiles/{uid}` y validar login.

### "Como quito admin ya?"
Quitar rol admin y, si aplica, quitar email de allowlist frontend.

### "Que comando SIEMPRE debo ejecutar si toco reglas?"
`npx firebase-tools deploy --only firestore:rules`.

### "Si Render esta bien pero permisos fallan?"
Casi seguro no se desplegaron reglas nuevas.

---

## 13. Checklist para pasar el proyecto a otro informatico

Entregar:

- URL Render produccion,
- repo GitHub,
- acceso Firebase project,
- este documento + README operativo completo,
- lista de admins autorizados,
- procedimiento de release y rollback.

Validar junto al receptor:

- login admin,
- login cliente,
- cambios admin se guardan,
- PDF cliente funciona,
- reporte compartido funciona,
- deploy reglas funciona.

---

## 14. Notas finales de criterio tecnico

- Este sistema es funcional y mantenible, pero no es "backend-first".
- El mayor salto de calidad no es visual: es control de datos y seguridad de operaciones criticas.
- Si se prioriza estabilidad real, la migracion de localStorage y la capa backend de gestion de usuarios deben ir antes que nuevas funcionalidades de UI.

