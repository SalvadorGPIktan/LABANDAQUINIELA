# La Banda · Quiniela MX

Aplicación responsive para una quiniela de amigos. Frontend estático sin compilación ni dependencias JavaScript, pensado para GitHub Pages. Supabase ofrece cuentas, base compartida, control de administrador y cierre con reloj del servidor. Incluye demostración local explícitamente separada de los datos reales.

## Probar el diseño

También puedes abrir `La-Banda-demo.html` con doble clic: es una demo autónoma que no requiere servidor.

Desde la raíz del proyecto:

```sh
python -m http.server 8080 --directory docs
```

Abre http://localhost:8080. Sin configurar Supabase se activa la demo: partidos y participantes ficticios, persistencia solo en este navegador. Crea un participante, marca los nueve encuentros y guarda; revisa Jornada 9 para ver resultados. En Administrar puedes modificar resultados y publicar jornadas de prueba. **La demo no permite compartir datos entre dispositivos.**

## Poner en funcionamiento con amigos

1. Crea un proyecto de Supabase. Ejecuta `supabase/schema.sql` en SQL Editor, una vez, en un proyecto nuevo. No contiene partidos inventados para producción.
2. En Authentication habilita email/password. Configura Site URL y Redirect URLs con la URL final de GitHub Pages. Configura el envío de correo para confirmar cuentas (un SMTP propio es recomendable para uso real); revisa los límites de tu proyecto.
3. En `docs/config.js` coloca `supabaseUrl` y la clave pública **anon** de Supabase. Es normal que la clave anon sea pública: las políticas RLS restringen los datos y las RPC validan las operaciones. **Nunca coloques service_role en el frontend o en Git.**
4. Crea un repositorio en GitHub llamado `quiniela-club`. Sube todo este proyecto, incluyendo `.github/workflows`. Desde consola:

```sh
git init
git add .
git commit -m "Crear La Banda: quiniela Liga MX"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/quiniela-club.git
git push -u origin main
```

5. En Settings → Pages → Build and deployment → Source elige **GitHub Actions**. Ejecuta `Publicar La Banda` desde Actions si el primer push ocurrió antes de activar Pages. Al terminar, tu dirección será `https://TU_USUARIO.github.io/quiniela-club/`.
6. Crea tu cuenta desde la app y confirma el correo. En Supabase → Authentication → Users copia tu UID. Ejecuta en SQL Editor:

```sql
insert into public.admins(user_id) values ('TU_UUID_DE_AUTH');
```

7. Vuelve a entrar. Aparecerá Administrar. Publica la primera jornada con **todos sus encuentros y horarios verificados**; el sistema calcula el cierre como `MIN(kickoff) - 24 horas`. Formato de cada línea:

```text
Equipo local | Equipo visitante | 2026-10-02T19:00:00-06:00 | ID_API_OPCIONAL
```

La fecha anterior solo demuestra el formato. **No es un calendario oficial.** Puedes omitir el último separador e ID si capturarás resultados manualmente.
8. Comparte la URL. Cada amigo registra nombre, correo y contraseña, confirma su correo y guarda una quiniela completa. Puede editarla hasta el cierre. El correo sirve para recuperar la identidad en otro dispositivo; solo el nombre es público. Esta versión usa una sola banda por proyecto; cualquiera que tenga el enlace puede crear cuenta. No hay cobros ni apuestas monetarias.

## Resultados automáticos

El conteo y los ganadores se calculan automáticamente sobre los marcadores guardados. Para que estos lleguen sin intervención se incluye `scripts/sync_results.py` y un workflow programado.

1. Obtén una clave de API-Football (API-Sports). Confirma que tu plan cubra los encuentros, temporada y consulta de múltiples IDs. No se presupone cobertura gratuita ni se incluye una clave. Consulta los IDs en el proveedor y asígnalos al crear cada partido.
2. GitHub → Settings → Secrets and variables → Actions → Secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (secreto de servidor; jamás en `docs/config.js`)
   - `API_FOOTBALL_KEY`
3. En Variables crea `AUTO_SYNC` con valor `true`.
4. Ejecuta manualmente `Actualizar resultados` y verifica su registro. El cron consulta cada 15 minutos; GitHub puede retrasarlo y no garantiza tiempo real. La página vuelve a consultar los datos cada minuto cuando no hay cambios sin guardar ni formularios abiertos. GitHub también puede deshabilitar cron por inactividad del repositorio: revisa Actions periódicamente.
5. La consulta incluye IDs históricos para recoger correcciones. El costo/cuota aumenta con el número de encuentros: cada ejecución hace aproximadamente `ceil(IDs / 20)` llamadas al proveedor; con 153 encuentros son hasta 768 consultas diarias. Ajusta cron o usa un plan compatible antes de habilitarlo.

El script nunca crea encuentros ni mezcla calendarios de diferentes torneos. Rechaza respuestas con errores de proveedor. Estados desconocidos, victorias administrativas y marcadores finales ausentes se dejan para revisión del administrador. Los partidos pospuestos mantienen la jornada pendiente; cancelados quedan anulados. Los resultados introducidos manualmente llevan `manual_override=true` y el sincronizador no los sobrescribe. Para volver al automático:

```sql
update public.matches set manual_override=false where id='UUID_DEL_PARTIDO';
```

Si el proveedor adelanta un partido, el cierre se adelanta para conservar las 24 horas. Si lo pospone, el cierre original se mantiene para no reabrir quinielas. Los pronósticos aceptados antes de conocerse el cambio permanecen válidos. El administrador debe comunicar estos cambios al grupo; no hay notificaciones automáticas.

## Reglas incluidas

- Pronóstico L / E / V: 1 punto por acertar; 0 por fallar. No marcador exacto.
- Solo se puntúan partidos finalizados; los marcadores en vivo son informativos.
- Quiniela completa obligatoria, guardada atómicamente. Una por cuenta y jornada.
- Cierre exacto 24 horas antes del primer partido, cualquier día de la semana.
- Pronósticos ajenos ocultos hasta el cierre, también en API/RLS.
- Horarios mostrados en America/Mexico_City, almacenamiento con zona horaria.
- Mayor cantidad de aciertos gana; empates comparten victoria.
- Ganador definitivo cuando todos los encuentros están finalizados o anulados. Si todos son anulados, no hay ganador.
- Liguilla: Play-in, cuartos, semifinales y final, ida y vuelta como jornadas independientes. Resultado en 90 minutos + compensación; sin tiempos extra ni penales. No se pronostica quién avanza ni se genera bracket automático.
- Historial por jornada, clasificación y acumulado global. La clasificación global suma aciertos y muestra las jornadas ganadas, incluyendo victorias compartidas.

## Seguridad y operación

El SQL concede escritura directa solo a columnas de resultado y solo para administradores. Las RPC crean jornadas y guardan pronósticos con validación del servidor. Los participantes no pueden modificar fechas, roles, resultados ni quinielas ajenas. Los nombres se escapan al renderizar. No hay claves de proveedor en navegador. El administrador puede corregir resultados; no se incluye auditoría completa de correcciones. Las sesiones se guardan en localStorage: cierra sesión en equipos compartidos.

No hay recuperación de contraseña en esta interfaz inicial: puede gestionarse desde Supabase Authentication. Antes de invitar a todo el grupo, prueba con dos cuentas reales que los datos se compartan, que el usuario normal no pueda editar resultados y que el cierre rechace peticiones fuera de plazo. No se pudo validar un entorno Supabase real sin las credenciales del propietario.

## Verificación local

```sh
node --test tests/core.test.mjs
python -m unittest discover -s tests -p 'test_*.py'
```

Comprueban puntuación, empates, cierre exacto con zona horaria, estados pospuestos/anulados, escape de HTML y marcador de 90 minutos en liguilla. Las políticas SQL deben verificarse en tu instancia Supabase con dos usuarios reales antes de invitar al grupo.

## Referencias

- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide

No hay despliegue ni servicio de resultados activo hasta que el propietario configura los servicios descritos.

Validación visual en navegador pendiente: este entorno no pudo descargar Chromium. La demo está disponible para revisión del propietario.

### Pruebas adicionales incluidas

```sh
npm install
npm run test:integration
```

Se verificaron además con PostgreSQL embebido (PGlite) las políticas de permisos, rechazo de cambios tras el cierre, ocultamiento de pronósticos incluso para administradores y revelación al cerrar. Con DOM simulado (LinkeDOM) se comprobó captura y guardado de nueve pronósticos, navegación, clasificación, ganador e interfaz administrativa. Estas pruebas no sustituyen la validación visual ni la conexión a Supabase real. Las dependencias son únicamente de desarrollo: no se cargan en la aplicación publicada.
