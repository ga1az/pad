# Contribuir a este fork de Pad

Este es el fork personal [ga1az/pad](https://github.com/ga1az/pad) de [PerpetualSoftware/pad](https://github.com/PerpetualSoftware/pad). La rama principal del fork es `custom`; `main` se conserva como referencia upstream. No se prometen tiempos de revisión ni procesos de triage del proyecto original.

## Elegir el destino del cambio

- Para las personalizaciones de este fork, abre el pull request contra **`ga1az/pad:custom`** y explica el cambio y su verificación.
- Para funciones o correcciones que deben llegar al proyecto original, consulta su [guía de contribución](https://github.com/PerpetualSoftware/pad/blob/main/CONTRIBUTING.md) y abre el pull request en **PerpetualSoftware/pad**, según sus reglas.
- Las actualizaciones desde upstream se revisan antes de integrarlas: `git fetch upstream`, compara los cambios y decide cómo incorporarlos a `custom`. No borres `main` ni hagas `reset --hard` de `custom` para igualarlo con upstream.

## Preparar el entorno

Requisitos: Go 1.26.5 o superior (toolchain 1.26.10 en `go.mod`), Node.js 24 (como en CI) para el frontend y `make`. Los scripts del frontend se definen en `web/package.json`.

```bash
git clone --branch custom https://github.com/ga1az/pad.git
cd pad
git remote add upstream https://github.com/PerpetualSoftware/pad.git
make build
```

`make build` ejecuta `npm ci` y `npm run build` en `web/` antes de compilar `./pad`. En un worktree, comprueba primero que `web/node_modules` no sea un enlace simbólico a otro checkout: `npm ci` reemplaza ese directorio. `make build-go` solo ejecuta la compilación Go; el binario sigue necesitando `web/build` y `web/build-materializer/materializer.js` para `go:embed`.

Para probar la CLI localmente, `./pad init` prepara la conexión y el workspace; `./pad server start` sirve por defecto en `127.0.0.1:7777`. `./pad server open` abre la UI y `./pad server info` muestra la conexión. Usa `./pad server --help` para confirmar los subcomandos. `~/.pad` contiene datos, configuración y credenciales: no lo agregues al repositorio. Evita apuntar pruebas o ejemplos a una base de producción.

## Verificación y despliegue

Ejecuta pruebas focalizadas según el área modificada. Las pruebas Go con SQLite usan datos temporales; las de PostgreSQL necesitan una instancia temporal mediante `PAD_TEST_POSTGRES_URL`. `make test-pg` existe, pero su receta no limita por sí sola el consumo de recursos. En esta máquina, para trabajos pesados usa un solo job a la vez, `GOMAXPROCS=2`, `GOFLAGS=-p=1` y el bloqueo compartido `~/.cache/pad-spec35-heavy.lock`. Estas variables no limitan la memoria: aplica también un cgroup con un presupuesto total de 2 CPU y 4 GiB, incluyendo PostgreSQL si lo arrancas. Ese límite no se activa automáticamente al ejecutar `make` o `go test`. Las pruebas Go no necesitan GPU. Usa navegador/headless solo cuando la verificación de interfaz lo requiera.

`make install` depende del build completo: puede ejecutar `npm ci`, reemplaza el binario instalado y reinicia el servidor. No es un paso rutinario de verificación ni una forma de omitir la web para cambios backend. Despliega localmente solo de forma explícita, tras comprobar a qué servidor afecta.

## Convenciones

Mantén los cambios pequeños y describe por qué son necesarios. Sigue los patrones existentes de Go, Svelte y TypeScript. Las migraciones de esquema deben cubrir ambos motores cuando corresponda: `internal/store/migrations/` (SQLite) y `internal/store/pgmigrations/` (PostgreSQL). Conserva la [licencia Apache 2.0](LICENSE), la atribución original y revisa el [CLA del repositorio](.github/CLA.md) antes de enviar una contribución.
