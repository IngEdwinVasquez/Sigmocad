import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Plus, Edit, Trash2, Upload } from 'lucide-react';

interface Company {
  id: string;
  name: string;
  logo_url: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
}

export function Companies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('name');

    console.log('Companies data:', data);
    console.log('Companies error:', error);

    if (!error && data) {
      setCompanies(data);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let logoUrl = editingCompany?.logo_url || null;

    if (logoFile) {
      setUploading(true);
      const fileExt = logoFile.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(filePath, logoFile);

      if (uploadError) {
        console.error('Error uploading logo:', uploadError);
        alert('Error al subir el logo');
        setUploading(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from('company-logos')
        .getPublicUrl(filePath);

      logoUrl = urlData.publicUrl;
      setUploading(false);
    }

    if (editingCompany) {
      const { error } = await supabase
        .from('companies')
        .update({
          name: formData.name,
          status: formData.status,
          logo_url: logoUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingCompany.id);

      if (error) {
        console.error('Error updating company:', error);
        alert('Error al actualizar empresa');
        return;
      }
    } else {
      const { error } = await supabase
        .from('companies')
        .insert([{
          name: formData.name,
          status: formData.status,
          logo_url: logoUrl,
        }]);

      if (error) {
        console.error('Error creating company:', error);
        alert('Error al crear empresa');
        return;
      }
    }

    setIsModalOpen(false);
    setEditingCompany(null);
    setFormData({ name: '', status: 'ACTIVE' });
    setLogoFile(null);
    fetchCompanies();
  };

  const handleEdit = (company: Company) => {
    setEditingCompany(company);
    setFormData({
      name: company.name,
      status: company.status,
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta empresa?')) return;

    const { error } = await supabase
      .from('companies')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting company:', error);
      alert('Error al eliminar empresa');
      return;
    }

    fetchCompanies();
  };

  const handleNew = () => {
    setEditingCompany(null);
    setFormData({ name: '', status: 'ACTIVE' });
    setLogoFile(null);
    setIsModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Empresas</h2>
          <p className="text-gray-600 mt-1">Gestiona las empresas del sistema</p>
        </div>
        <Button onClick={handleNew}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva Empresa
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Logo</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((company) => (
            <TableRow key={company.id}>
              <TableCell>
                {company.logo_url ? (
                  <img src={company.logo_url} alt={company.name} className="h-10 w-10 object-contain" />
                ) : (
                  <div className="h-10 w-10 bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs">
                    Sin logo
                  </div>
                )}
              </TableCell>
              <TableCell>{company.name}</TableCell>
              <TableCell>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  company.status === 'ACTIVE'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {company.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleEdit(company)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDelete(company.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {companies.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                No hay empresas registradas
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCompany ? 'Editar Empresa' : 'Nueva Empresa'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nombre"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Estado
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as 'ACTIVE' | 'INACTIVE' })}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ACTIVE">Activo</option>
              <option value="INACTIVE">Inactivo</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Logo
            </label>
            <div className="flex items-center gap-4">
              {editingCompany?.logo_url && !logoFile && (
                <img src={editingCompany.logo_url} alt="Logo actual" className="h-16 w-16 object-contain border rounded" />
              )}
              <label className="cursor-pointer">
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200">
                  <Upload className="w-4 h-4" />
                  {logoFile ? logoFile.name : 'Seleccionar logo'}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={uploading}>
              {uploading ? 'Subiendo...' : editingCompany ? 'Actualizar' : 'Crear'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
