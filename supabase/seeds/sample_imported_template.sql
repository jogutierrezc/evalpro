-- Example SQL to create a template similar to the CSV example
-- Run this in your Supabase SQL editor to create a sample template with sections and questions

begin;

insert into evaluation_templates (id, name, description, type, is_active, created_at)
values
  (gen_random_uuid(), 'Plantilla Ejemplo Comunicativas y Técnicas', 'Ejemplo creado desde seed', 'soft_skills', true, now())
returning id;

-- After running the above, copy the returned id and replace <TEMPLATE_ID> below, or run the whole script adjusted.

-- Example sections
insert into evaluation_sections (template_id, title, order_index)
values
  ('<TEMPLATE_ID>', 'Competencias Comunicativas', 0),
  ('<TEMPLATE_ID>', 'Competencias Técnicas', 1),
  ('<TEMPLATE_ID>', 'Comportamiento', 2)
returning id, title;

-- Example questions: replace section ids and template id accordingly
insert into evaluation_questions (template_id, section_id, question_text, question_type, options, weight, order_index, order_in_section)
values
  ('<TEMPLATE_ID>', '<SECTION_COMP_COMMS_ID>', '¿Escucha activamente a sus compañeros?', 'rating', null, 1, 0, 1),
  ('<TEMPLATE_ID>', '<SECTION_COMP_COMMS_ID>', '¿Se expresa con claridad?', 'rating', null, 1, 1, 2),
  ('<TEMPLATE_ID>', '<SECTION_COMP_TECH_ID>', '¿Conoce los procesos técnicos requeridos?', 'rating', null, 1, 2, 1),
  ('<TEMPLATE_ID>', '<SECTION_COMP_TECH_ID>', 'Describa una mejora que haya propuesto.', 'text', null, 0, 3, 2),
  ('<TEMPLATE_ID>', '<SECTION_BEHAVIOR_ID>', '¿Cumple con horarios y compromisos?', 'rating', null, 1, 4, 1),
  ('<TEMPLATE_ID>', '<SECTION_BEHAVIOR_ID>', '¿Recomendaría a este colaborador para un ascenso?', 'multiple_choice', jsonb_build_array('Sí','No','Tal vez'), 1, 5, 2);

commit;
