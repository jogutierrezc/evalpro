import { useState, useEffect, useRef } from 'react';
import { supabase, Office } from '../../lib/supabase';
import { Plus, Edit2, Trash2, Upload, Search, Filter, X, ChevronLeft, ChevronRight, Users, Save, Building2 } from 'lucide-react';
import * as XLSX from 'xlsx';

export function OfficesManagement() {
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingOffice, setEditingOffice] = useState<Office | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [parentFilter, setParentFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(9); // Grid layout, multiple of 3 looks good
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [formData, setFormData] = useState({ name: '', description: '', parent_id: '' });
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

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, parentFilter]);

  const loadOffices = async () => {
    try {
      setLoading(true);
      const [officesRes, membersRes] = await Promise.all([
        supabase.from('offices').select('*').order('name'),
        supabase.from('collaborator_offices').select('office_id')
      ]);

      if (officesRes.error) throw officesRes.error;

      // Calculate member counts
      const counts: Record<string, number> = {};
      (membersRes.data || []).forEach((row: any) => {
        counts[row.office_id] = (counts[row.office_id] || 0) + 1;
      });
      setMemberCounts(counts);
      setOffices(officesRes.data || []);
    } catch (error) {
      console.error('Error loading offices:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        parent_id: formData.parent_id || null,
      };

      if (editingOffice) {
        const { error } = await supabase
          .from('offices')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingOffice.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('offices')
          .insert([payload]);

        if (error) throw error;
      }

      setFormData({ name: '', description: '', parent_id: '' });
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
    setFormData({
      name: office.name,
      description: office.description || '',
      parent_id: office.parent_id || ''
    });
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
    setFormData({ name: '', description: '', parent_id: '' });
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

  // Helper to get parent name
  const getParentName = (parentId: string | null | undefined) => {
    if (!parentId) return null;
    return offices.find(o => o.id === parentId)?.name;
  };

  // Filter and Pagination Logic
  const filteredOffices = offices.filter(office => {
    const matchesSearch = office.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (office.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesParent = parentFilter ? office.parent_id === parentFilter : true;
    return matchesSearch && matchesParent;
  });

  const totalPages = Math.ceil(filteredOffices.length / itemsPerPage);
  const paginatedOffices = filteredOffices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-600" />
            Gestión de Oficinas
          </h2>
          <p className="text-slate-500 text-sm mt-1">Administra la estructura organizacional y dependencias.</p>
        </div>
        {!showForm && !showImport && (
          <div className="flex gap-3">
            <button
              onClick={handleOpenImport}
              className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl transition-all font-medium shadow-sm"
            >
              <Upload className="w-4 h-4" />
              Importar
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl transition-all font-medium shadow-lg shadow-blue-600/20"
            >
              <Plus className="w-4 h-4" />
              Nueva Oficina
            </button>
          </div>
        )}
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Buscar oficina..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
            />
          </div>
          <div className="relative md:w-64">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <select
              value={parentFilter}
              onChange={(e) => setParentFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm appearance-none cursor-pointer"
            >
              <option value="">Todas las dependencias</option>
              {offices.filter(o => !o.parent_id).map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-sm text-slate-500 font-medium">
          Mostrando <span className="text-slate-900">{filteredOffices.length}</span> oficinas
        </div>
      </div>

      {/* Offices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {paginatedOffices.map((office) => (
          <div key={office.id} className="bg-white border border-slate-100 rounded-2xl p-6 hover:shadow-lg hover:shadow-slate-200/50 transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 bg-gradient-to-l from-white via-white to-transparent pl-8">
              <button
                onClick={() => handleEdit(office)}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Editar"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(office.id)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Eliminar"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col h-full">
              <div className="mb-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="p-3 bg-blue-50 rounded-xl text-blue-600 mb-3 inline-block">
                    <Building2 className="w-6 h-6" />
                  </div>
                  {memberCounts[office.id] ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 text-slate-600 text-xs font-medium border border-slate-100">
                      <Users className="w-3 h-3" />
                      {memberCounts[office.id]}
                    </span>
                  ) : null}
                </div>

                <h3 className="font-bold text-slate-800 text-lg leading-tight mb-1">{office.name}</h3>

                {office.parent_id && (
                  <div className="flex items-center gap-1 text-xs text-slate-500 font-medium mt-1">
                    <span className="text-slate-300">↳</span>
                    <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                      {getParentName(office.parent_id)}
                    </span>
                  </div>
                )}
              </div>

              {office.description && (
                <p className="text-sm text-slate-500 line-clamp-2 mb-4 flex-1">
                  {office.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredOffices.length === 0 && (
        <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p>No se encontraron oficinas que coincidan con la búsqueda.</p>
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex justify-center mt-8">
          <div className="flex items-center gap-2 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-xl hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-slate-600"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {getPageNumbers().map((page, idx) => (
              <button
                key={idx}
                onClick={() => typeof page === 'number' && setCurrentPage(page)}
                disabled={page === '...'}
                className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${page === currentPage
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : page === '...'
                    ? 'text-slate-400 cursor-default'
                    : 'text-slate-600 hover:bg-slate-50'
                  }`}
              >
                {page}
              </button>
            ))}

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-xl hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-slate-600"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white/80 backdrop-blur-md rounded-t-3xl">
              <div>
                <h3 className="text-xl font-bold text-slate-800">
                  {editingOffice ? 'Editar Oficina' : 'Nueva Oficina'}
                </h3>
                <p className="text-sm text-slate-500">Complete la información de la dependencia</p>
              </div>
              <button
                onClick={handleCancel}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Nombre de la Oficina</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                    required
                    placeholder="Ej. Decanatura de Ingenierías"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Oficina Superior (Opcional)</label>
                  <div className="relative">
                    <select
                      value={formData.parent_id}
                      onChange={(e) => setFormData({ ...formData, parent_id: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none appearance-none cursor-pointer"
                    >
                      <option value="">Ninguna (Oficina Principal)</option>
                      {offices
                        .filter(o => o.id !== editingOffice?.id) // Prevent selecting self as parent
                        .map(o => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))
                      }
                    </select>
                    <ChevronRight className="absolute right-4 top-1/2 transform -translate-y-1/2 rotate-90 text-slate-400 w-4 h-4 pointer-events-none" />
                  </div>
                  <p className="text-xs text-slate-500">Seleccione si esta oficina depende de otra área.</p>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Descripción</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none resize-none"
                    rows={4}
                    placeholder="Breve descripción de las funciones de la oficina..."
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  {editingOffice ? 'Actualizar Oficina' : 'Guardar Oficina'}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-3 rounded-xl font-bold transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-8 animate-in zoom-in-95 duration-200 border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">Importar Oficinas</h3>
              <button
                onClick={() => setShowImport(false)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 text-center hover:border-blue-400 transition-colors">
                <Upload className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <div className="flex items-center justify-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) parseFile(file);
                    }}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl font-medium hover:bg-slate-50 transition-colors shadow-sm">
                    Seleccionar Archivo
                  </label>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Formatos soportados: .xlsx, .csv
                </p>
              </div>

              {parsing && <div className="text-sm text-slate-500 text-center">Procesando archivo...</div>}
              {importError && <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">{importError}</div>}

              {importRows.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-slate-700 mb-2">Previsualización ({importRows.length} filas)</div>
                  <div className="max-h-48 overflow-auto border border-slate-200 rounded-xl">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold text-slate-600 border-b border-slate-200">Nombre</th>
                          <th className="text-left px-4 py-3 font-semibold text-slate-600 border-b border-slate-200">Descripción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importRows.slice(0, 50).map((r, idx) => (
                          <tr key={idx} className="bg-white hover:bg-slate-50">
                            <td className="px-4 py-2 text-slate-700">{r.name}</td>
                            <td className="px-4 py-2 text-slate-500 truncate max-w-xs">{r.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <div className="text-sm text-slate-500">
                  {importSummary && (
                    <span>
                      Importadas: <span className="font-bold text-emerald-600">{importSummary.inserted}</span>
                      {' '}· Omitidas: <span className="font-bold text-slate-600">{importSummary.skipped}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowImport(false)}
                    className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
                  >
                    Cerrar
                  </button>
                  <button
                    disabled={parsing || importing || importRows.length === 0}
                    onClick={handleImport}
                    className={`px-5 py-2.5 rounded-xl text-white font-bold shadow-lg transition-all ${parsing || importing || importRows.length === 0
                      ? 'bg-slate-300 cursor-not-allowed shadow-none'
                      : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                      }`}
                  >
                    {importing ? 'Importando...' : 'Importar Datos'}
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
