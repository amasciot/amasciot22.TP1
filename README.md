# Nodos: Plan MPR vs calidad

Herramienta local para cruzar el **plan MPR** con series de **calidad** por nodo.

## Cómo usarla

Abrí `index.html` en el navegador (o serví la carpeta con cualquier static server). Los datos van en `data.js`.

## Qué hace

- **Resumen**: cobertura plan↔calidad, tabla por contratista e impacto pre/post de tareas completadas.
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
