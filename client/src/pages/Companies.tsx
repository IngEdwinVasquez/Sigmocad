import { useState, useEffect } from 'react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Plus, Edit, Trash2, Upload } from 'lucide-react';

interface Company {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  website_url: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
}

export function Companies() {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === 'SUPER_ADMIN';
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    website_url: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      setCompanies(await api.get<Company[]>('/api/companies', { all: true }));
    } catch (error) {
      console.error('Error fetching companies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let logoUrl = editingCompany?.logo_url || null;

    if (logoFile) {
      setUploading(true);
      try {
        const uploaded = await api.uploadFile('company-logos', logoFile);
        logoUrl = uploaded.url;
      } catch (error) {
        alert(errorMessage(error, 'Error al subir el logo'));
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    const payload = {
      name: formData.name,
      slug: formData.slug || undefined,
      website_url: formData.website_url || null,
      status: formData.status,
      logo_url: logoUrl,
    };

    try {
      if (editingCompany) {
        await api.put(`/api/companies/${editingCompany.id}`, payload);
      } else {
        await api.post('/api/companies', payload);
      }
    } catch (error) {
      alert(errorMessage(error, editingCompany ? 'Error al actualizar empresa' : 'Error al crear empresa'));
      return;
    }

    setIsModalOpen(false);
    setEditingCompany(null);
    setFormData({ name: '', slug: '', website_url: '', status: 'ACTIVE' });
    setLogoFile(null);
    fetchCompanies();
  };

  const handleEdit = (company: Company) => {
    setEditingCompany(company);
    setFormData({
      name: company.name,
      slug: company.slug || '',
      website_url: company.website_url || '',
      status: company.status,
    });
    setLogoFile(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta empresa? Se eliminarán también sus medios, campañas y datos asociados.')) return;

    try {
      await api.delete(`/api/companies/${id}`);
      fetchCompanies();
    } catch (error) {
      alert(errorMessage(error, 'Error al eliminar empresa'));
    }
  };

  const handleNew = () => {
    setEditingCompany(null);
    setFormData({ name: '', slug: '', website_url: '', status: 'ACTIVE' });
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
        {isSuperAdmin && (
          <Button onClick={handleNew}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva Empresa
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Logo</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Acceso (slug)</TableHead>
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
              <TableCell>
                <div className="font-medium">{company.name}</div>
                {company.website_url && <div className="text-xs text-gray-500">{company.website_url}</div>}
              </TableCell>
              <TableCell>
                {company.slug ? (
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded" title={`${window.location.origin}/?company=${company.slug}`}>
                    ?company={company.slug}
                  </code>
                ) : (
                  '-'
                )}
              </TableCell>
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
                  {isSuperAdmin && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleDelete(company.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {companies.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-gray-500 py-8">
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

          <Input
            label="Identificador para el login (slug)"
            value={formData.slug}
            onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
            placeholder="Se genera automáticamente a partir del nombre"
          />

          <Input
            label="Sitio web"
            value={formData.website_url}
            onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
            placeholder="https://www.ejemplo.com"
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
