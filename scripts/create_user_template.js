import XLSX from 'xlsx';

// Create a new workbook
const workbook = XLSX.utils.book_new();

// Sample data with headers
const data = [
  ['Nombre Completo', 'No. de Cedula', 'Correo', 'Rol', 'Oficina', 'Jefe Inmediato', 'Campus'],
  ['Juan Pérez', '12345678', 'juan@example.com', 'Colaborador', 'Oficina Central', 'María García', 'Bogota'],
  ['Ana López', '87654321', 'ana@example.com', 'Jefe de Oficina', 'Oficina Norte', '', 'Valledupar'],
];

// Create worksheet
const worksheet = XLSX.utils.aoa_to_sheet(data);

// Add to workbook
XLSX.utils.book_append_sheet(workbook, worksheet, 'Usuarios');

// Write to file
XLSX.writeFile(workbook, 'plantilla_usuarios.xlsx');

console.log('Plantilla creada: plantilla_usuarios.xlsx');