# Nodos: Plan MPR vs calidad

Herramienta local para cruzar el **plan MPR** con series de **calidad** por nodo.

## Cómo usarla

Abrí `index.html` en el navegador (o serví la carpeta con cualquier static server). Los datos van en `data.js`.

## Carga diaria

1. Bajá el **export.csv** de calidad y el **PLAN MPR.pdf**.
2. En la app, sección **Carga diaria**, elegí ambos archivos y tocá **Cruzar archivos**.
3. El cruce queda guardado en el navegador (IndexedDB) hasta que vuelvas al dataset de ejemplo.

## Qué hace

- **Resumen**: cobertura plan↔calidad y tabla por contratista.
- Lista nodos del plan y/o de calidad, con filtros por contratista, evento, tarea y búsqueda.
- Selección múltiple para ver evolución diaria de una métrica (QR por defecto).
- Marca en el gráfico las tareas **COMPLETADA** del plan.
- KPIs de la selección, Δ del período, copiar tabla y descargar CSV / plan sin calidad.
- Tema claro/oscuro y persistencia de filtros/selección en `localStorage`.

## Archivos

| Archivo | Rol |
|---------|-----|
| `index.html` | Estructura |
| `styles.css` | Estilos |
| `app.js` | Lógica de UI |
| `data.js` | Dataset (`window.NODOS_DATA`) |
