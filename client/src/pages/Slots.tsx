import { useState, useEffect, useRef } from 'react';
import { api, errorMessage } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Plus, Edit2, Trash2, Upload, Download } from 'lucide-react';
import { parseExcelFile, exportToExcel } from '../lib/excel-utils';
import { generatePDFReport } from '../lib/pdf-utils';

interface Media {
  id: string;
  name: string;
}

interface Slot {
  id: string;
  media_id: string;
  slug: string;
  width: number | null;
  height: number | null;
  status: 'ACTIVE' | 'PAUSED';
  media?: Media;
}

export function Slots() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    media_id: '',
    slug: '',
    width: '',
    height: '',
    status: 'ACTIVE' as 'ACTIVE' | 'PAUSED',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);

    try {
      const [slotsRes, mediaRes] = await Promise.all([
        api.get<Slot[]>('/api/slots'),
        api.get<Media[]>('/api/media', { status: 'ACTIVE' }),
      ]);
      setSlots(slotsRes);
      setMedia(mediaRes);
    } catch (error) {
      console.error('Error loading slots:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const slotData: any = {
      media_id: formData.media_id,
      width: formData.width ? parseInt(formData.width) : null,
      height: formData.height ? parseInt(formData.height) : null,
      status: formData.status,
    };

    // Only include slug if it's provided (for editing) or if user manually entered one
    if (formData.slug && formData.slug.trim() !== '') {
      slotData.slug = formData.slug;
    }

    try {
      if (editingSlot) {
        await api.put(`/api/slots/${editingSlot.id}`, slotData);
      } else {
        await api.post('/api/slots', slotData);
      }
      await fetchData();
      closeModal();
    } catch (error) {
      alert(errorMessage(error, editingSlot ? 'Error al actualizar el espacio' : 'Error al crear el espacio'));
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Está seguro de que desea eliminar este espacio?')) {
      try {
        await api.delete(`/api/slots/${id}`);
        await fetchData();
      } catch (error) {
        alert(errorMessage(error, 'Error al eliminar el espacio'));
      }
    }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await parseExcelFile(file);

      const mediaMap = new Map(media.map(m => [m.name.toLowerCase(), m.id]));

      const slotsToInsert = data.map(row => {
        const mediaName = String(row.media_name || row.media || '').toLowerCase();
        const mediaId = mediaMap.get(mediaName) || '';

        const slotData: any = {
          media_id: mediaId,
          width: row.width ? Number(row.width) : null,
          height: row.height ? Number(row.height) : null,
          status: (row.status as string)?.toUpperCase() === 'PAUSED' ? 'PAUSED' : 'ACTIVE',
        };

        // Only include slug if provided in Excel
        if (row.slug && String(row.slug).trim() !== '') {
          slotData.slug = String(row.slug);
        }

        return slotData;
      }).filter(slot => slot.media_id);

      if (slotsToInsert.length === 0) {
        alert('No se encontraron espacios válidos en el archivo Excel. Asegúrese de que los nombres de medios coincidan.');
        return;
      }

      try {
        const result = await api.post<{ imported: number }>('/api/slots/bulk', { items: slotsToInsert });
        await fetchData();
        alert(`Se importaron exitosamente ${result.imported} espacios`);
      } catch (error) {
        alert(errorMessage(error, 'Error al importar espacios'));
      }
    } catch (error) {
      alert('Error al leer el archivo Excel: ' + (error as Error).message);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExportExcel = () => {
    const exportData = slots.map(slot => ({
      Medio: slot.media?.name || '',
      Etiqueta: slot.slug,
      Ancho: slot.width || '',
      Alto: slot.height || '',
      Estado: slot.status === 'ACTIVE' ? 'Activo' : 'Pausado',
    }));

    exportToExcel(exportData, 'espacios_export');
  };

  const handleExportPDF = () => {
    const columns = [
      { header: 'Medio', dataKey: 'media_name' },
      { header: 'Etiqueta', dataKey: 'slug' },
      { header: 'Dimensiones', dataKey: 'dimensions' },
      { header: 'Estado', dataKey: 'status' },
    ];

    const exportData = slots.map(slot => ({
      media_name: slot.media?.name || '',
      slug: slot.slug,
      dimensions: slot.width && slot.height ? `${slot.width}x${slot.height}` : 'Flexible',
      status: slot.status === 'ACTIVE' ? 'Activo' : 'Pausado',
    }));

    generatePDFReport('Reporte de Espacios', columns, exportData, 'reporte_espacios');
  };

  const openModal = (slot?: Slot) => {
    if (slot) {
      setEditingSlot(slot);
      setFormData({
        media_id: slot.media_id,
        slug: slot.slug,
        width: slot.width?.toString() || '',
        height: slot.height?.toString() || '',
        status: slot.status,
      });
    } else {
      setEditingSlot(null);
      setFormData({
        media_id: '',
        slug: '',
        width: '',
        height: '',
        status: 'ACTIVE',
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSlot(null);
  };

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Espacios</h1>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleExcelUpload}
            className="hidden"
          />
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" />
            Importar Excel
          </Button>
          <Button variant="secondary" onClick={handleExportExcel}>
            <Download className="w-4 h-4 mr-2" />
            Exportar Excel
          </Button>
          <Button variant="secondary" onClick={handleExportPDF}>
            <Download className="w-4 h-4 mr-2" />
            Exportar PDF
          </Button>
          <Button onClick={() => openModal()}>
            <Plus className="w-4 h-4 mr-2" />
            Agregar Espacio
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Medio</TableHead>
              <TableHead>Etiqueta</TableHead>
              <TableHead>Dimensiones</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slots.map((slot) => (
              <TableRow key={slot.id}>
                <TableCell>{slot.media?.name}</TableCell>
                <TableCell>
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded">{slot.slug}</code>
                </TableCell>
                <TableCell>
                  {slot.width && slot.height ? (
                    <span className="text-sm">{slot.width} × {slot.height}</span>
                  ) : (
                    <span className="text-gray-400">Flexible</span>
                  )}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      slot.status === 'ACTIVE'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {slot.status}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openModal(slot)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(slot.id)}>
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingSlot ? 'Editar Espacio' : 'Agregar Espacio'}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={closeModal}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit}>
              {editingSlot ? 'Actualizar' : 'Crear'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Medio</label>
            <select
              value={formData.media_id}
              onChange={(e) => setFormData({ ...formData, media_id: e.target.value })}
              required
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Seleccionar Medio</option>
              {media.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Input
              label="Etiqueta"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              placeholder="Dejar vacío para auto-generar (SLOT-0001)"
            />
            <p className="text-xs text-gray-500 mt-1">
              {editingSlot
                ? 'Edite la etiqueta o déjela como está'
                : 'Si se deja vacío, se generará automáticamente (SLOT-0001, SLOT-0002, etc.)'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Ancho (px)"
              type="number"
              value={formData.width}
              onChange={(e) => setFormData({ ...formData, width: e.target.value })}
              placeholder="300"
            />

            <Input
              label="Alto (px)"
              type="number"
              value={formData.height}
              onChange={(e) => setFormData({ ...formData, height: e.target.value })}
              placeholder="250"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as 'ACTIVE' | 'PAUSED' })}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ACTIVE">Activo</option>
              <option value="PAUSED">Pausado</option>
            </select>
          </div>
        </form>
      </Modal>
    </div>
  );
}
