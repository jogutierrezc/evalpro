import { useState, useEffect, useRef } from 'react';
import { supabase, Office } from '../../lib/supabase';
import { Plus, Edit2, Trash2, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

export function OfficesManagement() {
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingOffice, setEditingOffice] = useState<Office | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [showImport, setShowImport] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importRows, setImportRows] = useState<Array<{ name: string; description?: string }>>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{ inserted: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadOffices();
  }, []);

  const loadOffices = async () => {
    try {
      const { data, error } = await supabase
        .from('offices')
        .select('*')
        .order('name');

      if (error) throw error;
      setOffices(data || []);
    } catch (error) {
      console.error('Error loading offices:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingOffice) {
        const { error } = await supabase
          .from('offices')
          .update({ ...formData, updated_at: new Date().toISOString() })
          .eq('id', editingOffice.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('offices')
          .insert([formData]);

        if (error) throw error;
      }

      setFormData({ name: '', description: '' });
      setEditingOffice(null);
      setShowForm(false);
      loadOffices();
    } catch (error) {
      console.error('Error saving office:', error);
      alert('Error al guardar la oficina');
    }
  };

  const handleEdit = (office: Office) => {
    setEditingOffice(office);
    setFormData({ name: office.name, description: office.description || '' });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar esta oficina?')) return;

    try {
      const { error } = await supabase
        .from('offices')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadOffices();
    } catch (error) {
      console.error('Error deleting office:', error);
      alert('Error al eliminar la oficina');
    }
  };

  const handleCancel = () => {
    setFormData({ name: '', description: '' });
    setEditingOffice(null);
    setShowForm(false);
  };

  const handleOpenImport = () => {
    setShowImport(true);
    setImportRows([]);
    setImportError(null);
    setImportSummary(null);
  };

  const parseFile = async (file: File) => {
    setParsing(true);
    setImportError(null);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Array<Record<string, any>>;

      const normalized: Array<{ name: string; description?: string }> = [];
      json.forEach((row) => {
        // Accept headers: name|Nombre, description|Descripción
        const name = (row.name || row.Nombre || '').toString().trim();
        const description = (row.description || row.Descripción || row.Descripcion || '').toString().trim();
        if (!name) return; // skip empty
        normalized.push({ name, description });
      });

      if (normalized.length === 0) {
        setImportError('El archivo no contiene filas válidas. Asegúrate de incluir la columna "name" o "Nombre".');
        setImportRows([]);
      } else {
        setImportRows(normalized);
      }
    } catch (e: any) {
      setImportError('No se pudo leer el archivo. Usa .xlsx o .csv con encabezados.');
      setImportRows([]);
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (importRows.length === 0) return;
    setImporting(true);
    setImportSummary(null);
    try {
      // Fetch existing offices to avoid duplicates by name (case-insensitive)
      const { data: existing } = await supabase.from('offices').select('id,name');
      const existingNames = new Set((existing || []).map((o: any) => (o.name || '').toString().toLowerCase().trim()));

      const toInsert = importRows.filter((r) => !existingNames.has((r.name || '').toLowerCase().trim()));
      const skipped = importRows.length - toInsert.length;

      let inserted = 0;
      // Insert in batches of 100
      for (let i = 0; i < toInsert.length; i += 100) {
        const chunk = toInsert.slice(i, i + 100);
        if (chunk.length === 0) continue;
        const { error } = await supabase.from('offices').insert(chunk.map((r) => ({ name: r.name, description: r.description || null })));
        if (error) throw error;
        inserted += chunk.length;
      }

      setImportSummary({ inserted, skipped });
      await loadOffices();
    } catch (err) {
      console.error('Import error:', err);
      setImportError('Ocurrió un error importando. Verifica el archivo y reintenta.');
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Gestión de Oficinas</h2>
        {!showForm && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenImport}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Upload className="w-5 h-5" />
              Importar
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              Nueva Oficina
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editingOffice ? 'Editar Oficina' : 'Nueva Oficina'}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre de la Oficina
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Descripción
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                {editingOffice ? 'Actualizar' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {offices.map((office) => (
          <div key={office.id} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-semibold text-gray-900">{office.name}</h3>
              <div className="flex gap-1">
                <button
                  onClick={() => handleEdit(office)}
                  className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="Editar"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(office.id)}
                  className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Eliminar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {office.description && (
              <p className="text-sm text-gray-600">{office.description}</p>
            )}
          </div>
        ))}
      </div>

      {offices.length === 0 && !showForm && (
        <div className="text-center py-12 text-gray-500">
          No hay oficinas registradas. Crea una nueva oficina para comenzar.
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Importar Oficinas</h3>
              <button onClick={() => setShowImport(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="space-y-4">
              <div className="text-sm text-gray-600">
                Carga un archivo .xlsx o .csv con las columnas: <span className="font-medium">Nombre</span> y opcional <span className="font-medium">Descripción</span>.{' '}
                <a className="text-blue-600 hover:underline" href="/templates/offices_import_template.csv" download>
                  Descargar plantilla
                </a>
              </div>
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) parseFile(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (fileInputRef.current) fileInputRef.current.value = '';
                    setImportRows([]);
                    setImportSummary(null);
                    setImportError(null);
                  }}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Limpiar
                </button>
              </div>
              {parsing && <div className="text-sm text-gray-500">Procesando archivo...</div>}
              {importError && <div className="text-sm text-red-600">{importError}</div>}
              {importRows.length > 0 && (
                <div>
                  <div className="text-sm text-gray-700 mb-2">Previsualización ({importRows.length} filas)</div>
                  <div className="max-h-64 overflow-auto border rounded">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-2 border-b">Nombre</th>
                          <th className="text-left px-3 py-2 border-b">Descripción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0, 50).map((r, idx) => (
                          <tr key={idx} className="odd:bg-white even:bg-gray-50">
                            <td className="px-3 py-2 border-b">{r.name}</td>
                            <td className="px-3 py-2 border-b">{r.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-600">
                  {importSummary && (
                    <span>
                      Importadas: <span className="font-semibold text-emerald-700">{importSummary.inserted}</span>
                      {' '}· Omitidas (duplicados por nombre): <span className="font-semibold text-gray-700">{importSummary.skipped}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowImport(false)}
                    className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-800"
                  >
                    Cerrar
                  </button>
                  <button
                    disabled={parsing || importing || importRows.length === 0}
                    onClick={handleImport}
                    className={`px-4 py-2 rounded text-white ${parsing || importing || importRows.length === 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                  >
                    {importing ? 'Importando...' : 'Importar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
