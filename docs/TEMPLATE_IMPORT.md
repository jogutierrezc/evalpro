Ejemplo de importación de plantillas desde Excel

Formato esperado (las columnas pueden tener mayúsculas/minúsculas y tildes):

- Sección (Sección / Section) — texto con el título de la sección. Si está vacío, se agrupa bajo "General".
- Pregunta (Pregunta / Question) — el texto de la pregunta.
- Tipo de Pregunta (Tipo de Pregunta / Type) — token libre que luego mapearás a uno de los tipos internos: rating, text, multiple_choice.
- Ponderación (Ponderación / Peso / Weight) — número opcional (ej. 1, 2, 0.5).

Notas:
- El parser normaliza mayúsculas/minúsculas y tildes. Acepta encabezados en español o en inglés.
- Si tu encabezado es "Tipo de Pregunta", aparecerá en la UI como token detectado para mapearlo a uno de los tipos internos.
- Valores internos permitidos para la plantilla (campo `type` en la tabla `evaluation_templates`) son: `soft_skills`, `self_evaluation`, `manager_to_employee`, `employee_to_manager`.

Ejemplo rápido (CSV): ver `template_import_example.csv` en este directorio.

Cómo usar:
1. En el admin de Formularios, haz clic en "Importar (Excel)".
2. Selecciona el archivo .xlsx/.xls (o .csv). El primer sheet se procesará.
3. Verás los tokens detectados bajo "Asignar tipos detectados a tipos internos". Mapea cada token a `Escala (rating)`, `Texto libre` o `Opción múltiple`.
4. Rellena Nombre del formulario y Tipo de formulario y presiona "Importar y Crear".

Si quieres que el import cree también opciones para preguntas de opción múltiple, añade una columna adicional llamada "Opciones" con las opciones separadas por `|` (por ejemplo: "Sí|No|A veces"). Actualmente el import no parsea las opciones automáticamente; podemos añadirlo si lo deseas.
