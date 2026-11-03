# Proyecto EvalPro - Sistema de Evaluaciones

Sistema de evaluacion de habilidades blandas y perfiles laborales.

## Estructura
- migrations/: 42 migraciones numeradas (0001-0042)
- diagnostics/: consultas de diagnostico (NO son migraciones, ejecutar a mano)
- README.md: Este archivo

## Migraciones
Ejecuta en orden: 0001, 0002, 0003, ..., 0042

### Para aplicar:
```bash
supabase db push
```

O manualmente en SQL Editor de Supabase.

## Tablas Principales
- offices: Oficinas
- users: Usuarios
- roles: Roles
- form_types: Tipos de formularios
- evaluation_templates: Plantillas
- evaluation_questions: Preguntas
- evaluations: Evaluaciones
- evaluation_periods: Periodos
- collaborators: Colaboradores

## Politicas RLS
- Admins: Acceso completo
- Office Managers: Acceso a su oficina
- Employees: Solo sus datos

## Diagramas y documentacion completa en desarrollo
