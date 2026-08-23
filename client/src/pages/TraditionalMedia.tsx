import { useState, useEffect } from 'react';
import { api, errorMessage } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Plus, Edit2, Trash2, Radio, Tv } from 'lucide-react';

interface TraditionalMedia {
  id: string;
  company_id: string;
  name: string;
  channel?: string;
  provincia?: string;
  schedule?: string;
  media_type: 'TV' | 'RADIO';
  cast_members?: string;
  cast_twitter?: string;
  cast_instagram?: string;
  cast_youtube?: string;
  cast_facebook?: string;
  cast_tiktok?: string;
  status: 'ACTIVE' | 'PAUSED';
  created_at: string;
}

export function TraditionalMedia() {
  const [media, setMedia] = useState<TraditionalMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMedia, setEditingMedia] = useState<TraditionalMedia | null>(null);
  const [filterType, setFilterType] = useState<'ALL' | 'TV' | 'RADIO'>('ALL');

  const [formData, setFormData] = useState({
    name: '',
    channel: '',
    provincia: '',
    schedule: '',
    media_type: 'TV' as 'TV' | 'RADIO',
    cast_members: '',
    cast_twitter: '',
    cast_instagram: '',
    cast_youtube: '',
    cast_facebook: '',
    cast_tiktok: '',
    status: 'ACTIVE' as 'ACTIVE' | 'PAUSED',
  });

  useEffect(() => {
    fetchMedia();
  }, []);

  const fetchMedia = async () => {
    setLoading(true);
    try {
      setMedia(await api.get<TraditionalMedia[]>('/api/traditional-media'));
    } catch (error) {
      console.error('Error loading traditional media:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const mediaData = {
      name: formData.name,
      channel: formData.channel || null,
      provincia: formData.provincia || null,
      schedule: formData.schedule || null,
      media_type: formData.media_type,
      cast_members: formData.cast_members || null,
      cast_twitter: formData.cast_twitter || null,
      cast_instagram: formData.cast_instagram || null,
      cast_youtube: formData.cast_youtube || null,
      cast_facebook: formData.cast_facebook || null,
      cast_tiktok: formData.cast_tiktok || null,
      status: formData.status,
    };

    try {
      if (editingMedia) {
        await api.put(`/api/traditional-media/${editingMedia.id}`, mediaData);
      } else {
        await api.post('/api/traditional-media', mediaData);
      }
      await fetchMedia();
      closeModal();
    } catch (error) {
      alert(errorMessage(error, 'Error al guardar el medio'));
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Está seguro de que desea eliminar este medio?')) {
      try {
        await api.delete(`/api/traditional-media/${id}`);
        await fetchMedia();
      } catch (error) {
        alert(errorMessage(error, 'Error al eliminar el medio'));
      }
    }
  };

  const openModal = (mediaItem?: TraditionalMedia) => {
    if (mediaItem) {
      setEditingMedia(mediaItem);
      setFormData({
        name: mediaItem.name,
        channel: mediaItem.channel || '',
        provincia: mediaItem.provincia || '',
        schedule: mediaItem.schedule || '',
        media_type: mediaItem.media_type,
        cast_members: mediaItem.cast_members || '',
        cast_twitter: mediaItem.cast_twitter || '',
        cast_instagram: mediaItem.cast_instagram || '',
        cast_youtube: mediaItem.cast_youtube || '',
        cast_facebook: mediaItem.cast_facebook || '',
        cast_tiktok: mediaItem.cast_tiktok || '',
        status: mediaItem.status,
      });
    } else {
      setEditingMedia(null);
      setFormData({
        name: '',
        channel: '',
        provincia: '',
        schedule: '',
        media_type: 'TV',
        cast_members: '',
        cast_twitter: '',
        cast_instagram: '',
        cast_youtube: '',
        cast_facebook: '',
        cast_tiktok: '',
        status: 'ACTIVE',
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingMedia(null);
  };

  const filteredMedia = media.filter(item => {
    if (filterType === 'ALL') return true;
    return item.media_type === filterType;
  });

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Medios: TV y Radio</h1>
        <Button onClick={() => openModal()}>
          <Plus className="w-4 h-4 mr-2" />
          Agregar Medio
        </Button>
      </div>

      <div className="mb-4 flex gap-2">
        <Button
          variant={filterType === 'ALL' ? 'primary' : 'secondary'}
          onClick={() => setFilterType('ALL')}
          size="sm"
        >
          Todos
        </Button>
        <Button
          variant={filterType === 'TV' ? 'primary' : 'secondary'}
          onClick={() => setFilterType('TV')}
          size="sm"
        >
          <Tv className="w-4 h-4 mr-1" />
          TV
        </Button>
        <Button
          variant={filterType === 'RADIO' ? 'primary' : 'secondary'}
          onClick={() => setFilterType('RADIO')}
          size="sm"
        >
          <Radio className="w-4 h-4 mr-1" />
          Radio
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Provincia</TableHead>
              <TableHead>Horario</TableHead>
              <TableHead>Elenco</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMedia.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {item.media_type === 'TV' ? (
                      <Tv className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Radio className="w-5 h-5 text-green-600" />
                    )}
                    <span className="font-medium">{item.media_type}</span>
                  </div>
                </TableCell>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.channel || '-'}</TableCell>
                <TableCell>{item.provincia || '-'}</TableCell>
                <TableCell>{item.schedule || '-'}</TableCell>
                <TableCell>
                  {item.cast_members ? (
                    <span className="text-sm text-gray-600">
                      {item.cast_members.split(',').length} miembros
                    </span>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      item.status === 'ACTIVE'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {item.status}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openModal(item)} title="Editar">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)} title="Eliminar">
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredMedia.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                  No hay medios registrados
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingMedia ? 'Editar Medio' : 'Agregar Medio'}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={closeModal}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit}>
              {editingMedia ? 'Actualizar' : 'Crear'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Medio</label>
            <select
              value={formData.media_type}
              onChange={(e) => setFormData({ ...formData, media_type: e.target.value as 'TV' | 'RADIO' })}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="TV">TV</option>
              <option value="RADIO">Radio</option>
            </select>
          </div>

          <Input
            label="Nombre del Medio"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            placeholder="Canal 5 Noticias"
          />

          <Input
            label="Canal / Frecuencia"
            value={formData.channel}
            onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
            placeholder="Canal 5 / 95.7 FM"
          />

          <Input
            label="Provincia"
            value={formData.provincia}
            onChange={(e) => setFormData({ ...formData, provincia: e.target.value })}
            placeholder="Santo Domingo"
          />

          <Input
            label="Horario"
            value={formData.schedule}
            onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
            placeholder="Lunes a Viernes 7:00 PM - 9:00 PM"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Elenco (separado por comas)
            </label>
            <textarea
              value={formData.cast_members}
              onChange={(e) => setFormData({ ...formData, cast_members: e.target.value })}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              placeholder="Juan Pérez, María García, Carlos López"
            />
            <p className="text-xs text-gray-500 mt-1">
              Ingrese los nombres separados por comas
            </p>
          </div>

          <div className="border-t pt-4 mt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Redes Sociales del Elenco</h3>
            <p className="text-xs text-gray-500 mb-3">
              Ingrese las cuentas separadas por comas para monitoreo
            </p>

            <div className="space-y-3">
              <Input
                label="Twitter / X"
                value={formData.cast_twitter}
                onChange={(e) => setFormData({ ...formData, cast_twitter: e.target.value })}
                placeholder="@usuario1, @usuario2, @usuario3"
              />

              <Input
                label="Instagram"
                value={formData.cast_instagram}
                onChange={(e) => setFormData({ ...formData, cast_instagram: e.target.value })}
                placeholder="@usuario1, @usuario2, @usuario3"
              />

              <Input
                label="YouTube"
                value={formData.cast_youtube}
                onChange={(e) => setFormData({ ...formData, cast_youtube: e.target.value })}
                placeholder="@canal1, @canal2, @canal3"
              />

              <Input
                label="Facebook"
                value={formData.cast_facebook}
                onChange={(e) => setFormData({ ...formData, cast_facebook: e.target.value })}
                placeholder="usuario1, usuario2, usuario3"
              />

              <Input
                label="TikTok"
                value={formData.cast_tiktok}
                onChange={(e) => setFormData({ ...formData, cast_tiktok: e.target.value })}
                placeholder="@usuario1, @usuario2, @usuario3"
              />
            </div>
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
