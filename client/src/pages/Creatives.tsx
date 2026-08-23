import { useState, useEffect } from 'react';
import { api, errorMessage } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Plus, Edit2, Trash2, Upload } from 'lucide-react';

interface Creative {
  id: string;
  name?: string;
  type: 'IMAGE' | 'GIF' | 'VIDEO' | 'HTML';
  src: string | null;
  src2: string | null;
  html: string | null;
  click_url: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  campaign?: string;
  created_at: string;
}

export function Creatives() {
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCreative, setEditingCreative] = useState<Creative | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'IMAGE' as 'IMAGE' | 'GIF' | 'VIDEO' | 'HTML',
    src: '',
    src2: '',
    html: '',
    click_url: '',
    width: '',
    height: '',
    duration_ms: '',
    campaign: '',
  });
  useEffect(() => {
    fetchCreatives();
  }, []);

  const fetchCreatives = async () => {
    setLoading(true);
    try {
      setCreatives(await api.get<Creative[]>('/api/creatives'));
    } catch (error) {
      console.error('Error loading creatives:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file: File, field: 'src' | 'src2') => {
    setUploading(true);
    try {
      const uploaded = await api.uploadFile('campanas', file);
      setFormData((prev) => ({ ...prev, [field]: uploaded.url }));
    } catch (error) {
      alert(errorMessage(error, 'Error al subir archivo'));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const creativeData = {
      name: formData.name || null,
      type: formData.type,
      src: formData.src || null,
      src2: formData.src2 || null,
      html: formData.html || null,
      click_url: formData.click_url || null,
      width: formData.width ? parseInt(formData.width) : null,
      height: formData.height ? parseInt(formData.height) : null,
      duration_ms: formData.duration_ms ? parseInt(formData.duration_ms) : null,
      campaign: formData.campaign || null,
    };

    try {
      if (editingCreative) {
        await api.put(`/api/creatives/${editingCreative.id}`, creativeData);
      } else {
        await api.post('/api/creatives', creativeData);
      }
      await fetchCreatives();
      closeModal();
    } catch (error) {
      alert(errorMessage(error, 'Error al guardar la campaña'));
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Está seguro de que desea eliminar esta campaña?')) {
      try {
        await api.delete(`/api/creatives/${id}`);
        await fetchCreatives();
      } catch (error) {
        alert(errorMessage(error, 'Error al eliminar la campaña'));
      }
    }
  };

  const openModal = (creative?: Creative) => {
    if (creative) {
      setEditingCreative(creative);
      setFormData({
        name: creative.name || '',
        type: creative.type,
        src: creative.src || '',
        src2: creative.src2 || '',
        html: creative.html || '',
        click_url: creative.click_url || '',
        width: creative.width?.toString() || '',
        height: creative.height?.toString() || '',
        duration_ms: creative.duration_ms?.toString() || '',
        campaign: creative.campaign || '',
      });
    } else {
      setEditingCreative(null);
      setFormData({
        name: '',
        type: 'IMAGE',
        src: '',
        src2: '',
        html: '',
        click_url: '',
        width: '',
        height: '',
        duration_ms: '',
        campaign: '',
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCreative(null);
  };

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Campañas</h1>
        <Button onClick={() => openModal()}>
          <Plus className="w-4 h-4 mr-2" />
          Agregar Campaña
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Vista Previa</TableHead>
              <TableHead>Dimensiones</TableHead>
              <TableHead>Campaña</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {creatives.map((creative) => (
              <TableRow key={creative.id}>
                <TableCell>
                  <span className="font-medium text-sm">
                    {creative.name || 'Campaña sin nombre'}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="inline-flex px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800">
                    {creative.type}
                  </span>
                </TableCell>
                <TableCell>
                  {(creative.type === 'IMAGE' || creative.type === 'GIF') && creative.src && (
                    <img src={creative.src} alt="Creative" className="h-12 w-auto object-contain" />
                  )}
                  {creative.type === 'VIDEO' && creative.src && (
                    <video src={creative.src} className="h-12 w-auto object-contain" />
                  )}
                  {creative.type === 'HTML' && (
                    <span className="text-xs text-gray-500">Contenido HTML</span>
                  )}
                </TableCell>
                <TableCell>
                  {creative.width && creative.height ? (
                    <span className="text-sm">{creative.width} × {creative.height}</span>
                  ) : (
                    <span className="text-gray-400">No definido</span>
                  )}
                </TableCell>
                <TableCell>
                  {creative.campaign ? (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      {creative.campaign}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openModal(creative)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(creative.id)}>
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
        title={editingCreative ? 'Editar Campaña' : 'Agregar Campaña'}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={closeModal}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={uploading}>
              {editingCreative ? 'Actualizar' : 'Crear'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nombre"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            placeholder="Banner Campaña Verano 2024"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="IMAGE">Imagen</option>
              <option value="GIF">GIF</option>
              <option value="VIDEO">Video</option>
              <option value="HTML">HTML</option>
            </select>
          </div>

          {formData.type !== 'HTML' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fuente Primaria {formData.type === 'VIDEO' && '(MP4)'}
              </label>
              <div className="flex gap-2">
                <Input
                  value={formData.src}
                  onChange={(e) => setFormData({ ...formData, src: e.target.value })}
                  placeholder="https://..."
                  className="flex-1"
                />
                <input
                  type="file"
                  id="file-upload-src"
                  className="hidden"
                  accept={formData.type === 'VIDEO' ? 'video/*' : 'image/*'}
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'src')}
                  disabled={uploading}
                />
                <label htmlFor="file-upload-src" className={uploading ? 'cursor-not-allowed' : 'cursor-pointer'}>
                  <div className={`inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 rounded-md px-4 py-2 text-base ${uploading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500'}`}>
                    <Upload className="w-4 h-4" />
                  </div>
                </label>
              </div>
            </div>
          )}

          {formData.type === 'VIDEO' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fuente Secundaria (WebM)
              </label>
              <div className="flex gap-2">
                <Input
                  value={formData.src2}
                  onChange={(e) => setFormData({ ...formData, src2: e.target.value })}
                  placeholder="https://..."
                  className="flex-1"
                />
                <input
                  type="file"
                  id="file-upload-src2"
                  className="hidden"
                  accept="video/*"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'src2')}
                  disabled={uploading}
                />
                <label htmlFor="file-upload-src2" className={uploading ? 'cursor-not-allowed' : 'cursor-pointer'}>
                  <div className={`inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 rounded-md px-4 py-2 text-base ${uploading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500'}`}>
                    <Upload className="w-4 h-4" />
                  </div>
                </label>
              </div>
            </div>
          )}

          {formData.type === 'HTML' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contenido HTML</label>
              <textarea
                value={formData.html}
                onChange={(e) => setFormData({ ...formData, html: e.target.value })}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                rows={8}
                placeholder="<div>Tu HTML aquí</div>"
              />
            </div>
          )}

          <Input
            label="URL de Clic"
            value={formData.click_url}
            onChange={(e) => setFormData({ ...formData, click_url: e.target.value })}
            placeholder="https://example.com"
          />

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

          {formData.type === 'VIDEO' && (
            <Input
              label="Duración (ms)"
              type="number"
              value={formData.duration_ms}
              onChange={(e) => setFormData({ ...formData, duration_ms: e.target.value })}
              placeholder="5000"
            />
          )}

          <Input
            label="Campaña"
            value={formData.campaign}
            onChange={(e) => setFormData({ ...formData, campaign: e.target.value })}
            placeholder="Campaña Verano 2024"
          />

          {uploading && (
            <div className="text-sm text-blue-600">Subiendo archivo...</div>
          )}
        </form>
      </Modal>
    </div>
  );
}
