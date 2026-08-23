import { useState, useEffect } from 'react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Plus, Edit, Trash2, ShieldCheck, UserX } from 'lucide-react';

interface Company {
  id: string;
  name: string;
}

type Role = 'SUPER_ADMIN' | 'ADMIN' | 'USER';

interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  company_id: string | null;
  is_active: boolean;
  last_login_at: string | null;
  companies?: Company | null;
  created_at: string;
}

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Master Admin',
  ADMIN: 'Administrador',
  USER: 'Usuario',
};

const emptyForm = {
  email: '',
  password: '',
  full_name: '',
  role: 'USER' as Role,
  company_id: '',
  is_active: true,
};

export function Users() {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === 'SUPER_ADMIN';
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewUserModal, setIsNewUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    fetchUsers();
    fetchCompanies();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      setUsers(await api.get<User[]>('/api/users'));
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      setCompanies(await api.get<Company[]>('/api/companies'));
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };

  const handleSubmitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      await api.post('/api/users', {
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name,
        role: formData.role,
        company_id: formData.company_id || null,
        is_active: formData.is_active,
      });
      setIsNewUserModal(false);
      setFormData(emptyForm);
      fetchUsers();
    } catch (error) {
      setFormError(errorMessage(error, 'Error al crear usuario'));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setFormError('');
    setSaving(true);
    try {
      await api.put(`/api/users/${editingUser.id}`, {
        full_name: formData.full_name,
        role: formData.role,
        company_id: formData.company_id || null,
        is_active: formData.is_active,
        password: formData.password || undefined,
      });
      setIsModalOpen(false);
      setEditingUser(null);
      setFormData(emptyForm);
      fetchUsers();
    } catch (error) {
      setFormError(errorMessage(error, 'Error al actualizar usuario'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormError('');
    setFormData({
      email: user.email,
      password: '',
      full_name: user.full_name || '',
      role: user.role,
      company_id: user.company_id || '',
      is_active: user.is_active,
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (user: User) => {
    if (!confirm(`¿Estás seguro de eliminar al usuario ${user.email}?`)) return;
    try {
      await api.delete(`/api/users/${user.id}`);
      fetchUsers();
    } catch (error) {
      alert(errorMessage(error, 'Error al eliminar usuario'));
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      await api.put(`/api/users/${user.id}`, { is_active: !user.is_active });
      fetchUsers();
    } catch (error) {
      alert(errorMessage(error, 'Error al actualizar usuario'));
    }
  };

  const handleNew = () => {
    setEditingUser(null);
    setFormError('');
    setFormData({ ...emptyForm, company_id: !isSuperAdmin && profile?.company_id ? profile.company_id : '' });
    setIsNewUserModal(true);
  };

  const roleOptions: Role[] = isSuperAdmin ? ['USER', 'ADMIN', 'SUPER_ADMIN'] : ['USER', 'ADMIN'];

  const roleBadge = (role: Role) =>
    role === 'SUPER_ADMIN'
      ? 'bg-yellow-100 text-yellow-800'
      : role === 'ADMIN'
        ? 'bg-blue-100 text-blue-800'
        : 'bg-gray-100 text-gray-800';

  const renderFormFields = (isEdit: boolean) => (
    <>
      <Input
        label="Email"
        type="email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        required
        disabled={isEdit}
        autoComplete="off"
      />

      <Input
        label={isEdit ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}
        type="password"
        value={formData.password}
        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
        required={!isEdit}
        minLength={6}
        autoComplete="new-password"
      />

      <Input
        label="Nombre Completo"
        value={formData.full_name}
        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Empresa</label>
        <select
          value={formData.company_id}
          onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          required={formData.role !== 'SUPER_ADMIN'}
          disabled={!isSuperAdmin}
        >
          <option value="">{formData.role === 'SUPER_ADMIN' ? 'Sin empresa (acceso global)' : 'Seleccionar empresa'}</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Rol</label>
        <select
          value={formData.role}
          onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isEdit && editingUser?.id === profile?.id}
        >
          {roleOptions.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={formData.is_active}
          onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
          disabled={isEdit && editingUser?.id === profile?.id}
          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        <span className="text-sm font-medium text-gray-700">Usuario activo</span>
      </label>

      {formError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{formError}</div>}
    </>
  );

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
          <h2 className="text-2xl font-bold text-gray-900">Usuarios</h2>
          <p className="text-gray-600 mt-1">Gestiona los usuarios del sistema y sus accesos</p>
        </div>
        <Button onClick={handleNew}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Usuario
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Empresa</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Último acceso</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  {user.email}
                  {user.id === profile?.id && <span className="text-xs text-slate-400">(tú)</span>}
                </div>
              </TableCell>
              <TableCell>{user.full_name || '-'}</TableCell>
              <TableCell>{user.companies?.name || '-'}</TableCell>
              <TableCell>
                <span className={`px-2 py-1 text-xs rounded-full ${roleBadge(user.role)}`}>{ROLE_LABELS[user.role]}</span>
              </TableCell>
              <TableCell>
                <span className={`px-2 py-1 text-xs rounded-full ${user.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                  {user.is_active ? 'Activo' : 'Inactivo'}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-xs text-gray-600">
                  {user.last_login_at ? new Date(user.last_login_at).toLocaleString('es-DO') : 'Nunca'}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => handleEdit(user)} title="Editar">
                    <Edit className="w-4 h-4" />
                  </Button>
                  {user.id !== profile?.id && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleToggleActive(user)}
                        title={user.is_active ? 'Desactivar' : 'Activar'}
                      >
                        {user.is_active ? <UserX className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => handleDelete(user)} title="Eliminar">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {users.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                No hay usuarios registrados
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Modal isOpen={isNewUserModal} onClose={() => setIsNewUserModal(false)} title="Nuevo Usuario">
        <form onSubmit={handleSubmitNew} className="space-y-4">
          {renderFormFields(false)}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsNewUserModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Creando...' : 'Crear'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Editar Usuario">
        <form onSubmit={handleSubmitEdit} className="space-y-4">
          {renderFormFields(true)}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando...' : 'Actualizar'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
