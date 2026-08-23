import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Upload, Zap } from 'lucide-react';
import { parseExcelFile } from '../lib/excel-utils';

interface Media {
  id: string;
  name: string;
}

interface Slot {
  id: string;
  slug: string;
  campaign?: string;
  media?: Media;
}

interface Creative {
  id: string;
  name?: string;
  type: string;
  campaign?: string;
}

interface Assignment {
  id: string;
  slot_id: string;
  creative_id: string | null;
  is_active: boolean;
  weight: number;
  start_at: string | null;
  end_at: string | null;
  slots?: Slot;
  creatives?: Creative;
}

export function Assignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    slot_id: '',
    creative_id: '',
    is_active: false,
    weight: '1',
    start_at: '',
    end_at: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);

    const [assignmentsRes, slotsRes, creativesRes] = await Promise.all([
      supabase
        .from('assignments')
        .select('*, slots(id, slug, campaign, media(id, name)), creatives(id, name, type, campaign)')
        .order('updated_at', { ascending: false }),
      supabase.from('slots').select('id, slug, campaign, media(id, name)').eq('status', 'ACTIVE'),
      supabase.from('creatives').select('id, name, type, campaign'),
    ]);

    if (assignmentsRes.data) setAssignments(assignmentsRes.data);
    if (slotsRes.data) setSlots(slotsRes.data);
    if (creativesRes.data) setCreatives(creativesRes.data);

    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const assignmentData = {
      slot_id: formData.slot_id,
      creative_id: formData.creative_id || null,
      is_active: formData.is_active,
      weight: parseInt(formData.weight) || 1,
      start_at: formData.start_at || null,
      end_at: formData.end_at || null,
      updated_at: new Date().toISOString(),
    };

    if (editingAssignment) {
      const { error } = await supabase
        .from('assignments')
        .update(assignmentData)
        .eq('id', editingAssignment.id);

      if (!error) {
        await fetchData();
        closeModal();
      }
    } else {
      const { error } = await supabase
        .from('assignments')
        .insert(assignmentData);

      if (!error) {
        await fetchData();
        closeModal();
      }
    }
  };

  const handleAutoAssign = async () => {
    const campaignGroups = new Map<string, { slots: Slot[]; creatives: Creative[] }>();

    slots.forEach(slot => {
      if (slot.campaign) {
        if (!campaignGroups.has(slot.campaign)) {
          campaignGroups.set(slot.campaign, { slots: [], creatives: [] });
        }
        campaignGroups.get(slot.campaign)!.slots.push(slot);
      }
    });

    creatives.forEach(creative => {
      if (creative.campaign) {
        if (!campaignGroups.has(creative.campaign)) {
          campaignGroups.set(creative.campaign, { slots: [], creatives: [] });
        }
        campaignGroups.get(creative.campaign)!.creatives.push(creative);
      }
    });

    const newAssignments: any[] = [];

    campaignGroups.forEach(({ slots: campaignSlots, creatives: campaignCreatives }, campaign) => {
      if (campaignSlots.length > 0 && campaignCreatives.length > 0) {
        campaignSlots.forEach(slot => {
          campaignCreatives.forEach(creative => {
            newAssignments.push({
              slot_id: slot.id,
              creative_id: creative.id,
              is_active: true,
              weight: 1,
              updated_at: new Date().toISOString(),
            });
          });
        });
      }
    });

    if (newAssignments.length > 0) {
      const { error } = await supabase
        .from('assignments')
        .insert(newAssignments);

      if (!error) {
        await fetchData();
        alert(`Se crearon exitosamente ${newAssignments.length} asignaciones automáticas basadas en campañas`);
      } else {
        alert('Error creating auto assignments: ' + error.message);
      }
    } else {
      alert('No se encontraron campañas coincidentes entre espacios y campañas');
    }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await parseExcelFile(file);

      const slotMap = new Map<string, string>();
      slots.forEach(slot => {
        const key = `${slot.media?.name}-${slot.slug}`.toLowerCase();
        slotMap.set(key, slot.id);
      });

      const creativeMap = new Map<string, string>();
      creatives.forEach(creative => {
        if (creative.name) {
          creativeMap.set(creative.name.toLowerCase(), creative.id);
        }
      });

      const assignmentsToInsert = data.map(row => {
        const mediaName = String(row.media_name || row.media || '');
        const slotSlug = String(row.slot_slug || row.slot || '');
        const creativeName = String(row.creative_name || row.creative || '');

        const slotKey = `${mediaName}-${slotSlug}`.toLowerCase();
        const slotId = slotMap.get(slotKey);
        const creativeId = creativeMap.get(creativeName.toLowerCase());

        return {
          slot_id: slotId || '',
          creative_id: creativeId || null,
          is_active: String(row.is_active || row.active || 'true').toLowerCase() === 'true',
          weight: row.weight ? Number(row.weight) : 1,
          start_at: row.start_at ? String(row.start_at) : null,
          end_at: row.end_at ? String(row.end_at) : null,
          updated_at: new Date().toISOString(),
        };
      }).filter(assignment => assignment.slot_id && assignment.creative_id);

      if (assignmentsToInsert.length === 0) {
        alert('No se encontraron asignaciones válidas en el archivo Excel. Verifique nombres de medios, slugs de espacios y nombres de campañas.');
        return;
      }

      const { error } = await supabase
        .from('assignments')
        .insert(assignmentsToInsert);

      if (!error) {
        await fetchData();
        alert(`Se importaron exitosamente ${assignmentsToInsert.length} asignaciones`);
      } else {
        alert('Error al importar asignaciones: ' + error.message);
      }
    } catch (error) {
      alert('Error al leer el archivo Excel: ' + (error as Error).message);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const toggleActive = async (assignment: Assignment) => {
    const { error } = await supabase
      .from('assignments')
      .update({ is_active: !assignment.is_active, updated_at: new Date().toISOString() })
      .eq('id', assignment.id);

    if (!error) {
      await fetchData();
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Está seguro de que desea eliminar esta asignación?')) {
      const { error } = await supabase
        .from('assignments')
        .delete()
        .eq('id', id);

      if (!error) {
        await fetchData();
      }
    }
  };

  const openModal = (assignment?: Assignment) => {
    if (assignment) {
      setEditingAssignment(assignment);
      setFormData({
        slot_id: assignment.slot_id,
        creative_id: assignment.creative_id || '',
        is_active: assignment.is_active,
        weight: assignment.weight.toString(),
        start_at: assignment.start_at ? assignment.start_at.slice(0, 16) : '',
        end_at: assignment.end_at ? assignment.end_at.slice(0, 16) : '',
      });
    } else {
      setEditingAssignment(null);
      setFormData({
        slot_id: '',
        creative_id: '',
        is_active: false,
        weight: '1',
        start_at: '',
        end_at: '',
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingAssignment(null);
  };

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Asignaciones</h1>
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
          <Button variant="secondary" onClick={handleAutoAssign}>
            <Zap className="w-4 h-4 mr-2" />
            Asignar Automáticamente por Campaña
          </Button>
          <Button onClick={() => openModal()}>
            <Plus className="w-4 h-4 mr-2" />
            Agregar Asignación
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Espacio</TableHead>
              <TableHead>Campaña</TableHead>
              <TableHead>Campaña</TableHead>
              <TableHead>Activo</TableHead>
              <TableHead>Peso</TableHead>
              <TableHead>Programación</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments.map((assignment) => (
              <TableRow key={assignment.id}>
                <TableCell>
                  <div>
                    <div className="text-sm font-medium">{assignment.slots?.media?.name}</div>
                    <code className="text-xs bg-gray-100 px-2 py-0.5 rounded">{assignment.slots?.slug}</code>
                  </div>
                </TableCell>
                <TableCell>
                  {assignment.creatives ? (
                    <div>
                      <div className="text-sm font-medium">{assignment.creatives.name || 'Unnamed'}</div>
                      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800">
                        {assignment.creatives.type}
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-400">Ninguno</span>
                  )}
                </TableCell>
                <TableCell>
                  {assignment.slots?.campaign || assignment.creatives?.campaign ? (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                      {assignment.slots?.campaign || assignment.creatives?.campaign}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <button onClick={() => toggleActive(assignment)} className="focus:outline-none">
                    {assignment.is_active ? (
                      <ToggleRight className="w-8 h-8 text-green-600" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-gray-300" />
                    )}
                  </button>
                </TableCell>
                <TableCell>{assignment.weight}</TableCell>
                <TableCell>
                  {assignment.start_at || assignment.end_at ? (
                    <div className="text-xs">
                      {assignment.start_at && <div>Desde: {new Date(assignment.start_at).toLocaleString()}</div>}
                      {assignment.end_at && <div>Hasta: {new Date(assignment.end_at).toLocaleString()}</div>}
                    </div>
                  ) : (
                    <span className="text-gray-400">Siempre</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openModal(assignment)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(assignment.id)}>
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
        title={editingAssignment ? 'Editar Asignación' : 'Agregar Asignación'}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={closeModal}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit}>
              {editingAssignment ? 'Actualizar' : 'Crear'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Espacio</label>
            <select
              value={formData.slot_id}
              onChange={(e) => setFormData({ ...formData, slot_id: e.target.value })}
              required
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Seleccionar Espacio</option>
              {slots.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {slot.media?.name} - {slot.slug} {slot.campaign && `(${slot.campaign})`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campaña</label>
            <select
              value={formData.creative_id}
              onChange={(e) => setFormData({ ...formData, creative_id: e.target.value })}
              required
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Seleccionar Campaña</option>
              {creatives.map((creative) => (
                <option key={creative.id} value={creative.id}>
                  {creative.name || creative.type} {creative.campaign && `(${creative.campaign})`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
              Activo
            </label>
          </div>

          <Input
            label="Peso"
            type="number"
            min="1"
            value={formData.weight}
            onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
            placeholder="1"
          />

          <Input
            label="Inicio (opcional)"
            type="datetime-local"
            value={formData.start_at}
            onChange={(e) => setFormData({ ...formData, start_at: e.target.value })}
          />

          <Input
            label="Fin (opcional)"
            type="datetime-local"
            value={formData.end_at}
            onChange={(e) => setFormData({ ...formData, end_at: e.target.value })}
          />
        </form>
      </Modal>
    </div>
  );
}
