import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useCompany } from '../lib/use-company';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Input } from '../components/ui/Input';
import { Mail, Search, CheckCircle, XCircle, Clock, Calendar, User, FileText } from 'lucide-react';

interface EmailRecord {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  status: 'SENT' | 'FAILED' | 'PENDING';
  sent_at: string;
  error_message: string | null;
  metadata: Record<string, any>;
  media_id: string | null;
  news_submission_id: string | null;
  sent_by: string | null;
  media?: {
    name: string;
  };
  news_submission?: {
    title: string;
  };
  sender?: {
    full_name: string;
  };
}

export function EmailHistory() {
  const { companyId } = useCompany();
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [filteredEmails, setFilteredEmails] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<string>('ALL');

  useEffect(() => {
    if (companyId) {
      fetchEmailHistory();
    } else {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    applyFilters();
  }, [emails, searchTerm, statusFilter, dateFilter]);

  const fetchEmailHistory = async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setEmails(await api.get<EmailRecord[]>('/api/email-history'));
    } catch (err) {
      console.error('Exception fetching email history:', err);
      setEmails([]);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...emails];

    if (searchTerm) {
      filtered = filtered.filter(email =>
        email.recipient_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        email.recipient_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        email.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
        email.media?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        email.news_submission?.title.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'ALL') {
      filtered = filtered.filter(email => email.status === statusFilter);
    }

    if (dateFilter !== 'ALL') {
      const now = new Date();
      const filterDate = new Date();

      switch (dateFilter) {
        case 'TODAY':
          filterDate.setHours(0, 0, 0, 0);
          break;
        case 'WEEK':
          filterDate.setDate(now.getDate() - 7);
          break;
        case 'MONTH':
          filterDate.setMonth(now.getMonth() - 1);
          break;
      }

      filtered = filtered.filter(email => new Date(email.sent_at) >= filterDate);
    }

    setFilteredEmails(filtered);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SENT':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'FAILED':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'PENDING':
        return <Clock className="w-5 h-5 text-yellow-600" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SENT':
        return 'bg-green-100 text-green-800';
      case 'FAILED':
        return 'bg-red-100 text-red-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'SENT':
        return 'Enviado';
      case 'FAILED':
        return 'Fallido';
      case 'PENDING':
        return 'Pendiente';
      default:
        return status;
    }
  };

  const stats = {
    total: emails.length,
    sent: emails.filter(e => e.status === 'SENT').length,
    failed: emails.filter(e => e.status === 'FAILED').length,
    pending: emails.filter(e => e.status === 'PENDING').length,
  };

  if (loading) {
    return <div className="text-center py-8">Cargando historial...</div>;
  }

  if (!companyId) {
    return (
      <div className="text-center py-12">
        <Mail className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="text-lg font-medium text-gray-900">No hay empresa seleccionada</p>
        <p className="text-sm text-gray-600 mt-2">Selecciona una empresa para ver el historial de correos</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Historial de Correos</h1>
          <p className="text-gray-600 mt-1">Registro de todos los correos enviados a medios</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs text-gray-600">Total Enviados</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{stats.sent}</p>
            <p className="text-xs text-gray-600">Exitosos</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
            <p className="text-xs text-gray-600">Fallidos</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            <p className="text-xs text-gray-600">Pendientes</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative col-span-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                placeholder="Buscar por email, nombre, asunto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Todos los estados</option>
              <option value="SENT">Enviados</option>
              <option value="FAILED">Fallidos</option>
              <option value="PENDING">Pendientes</option>
            </select>

            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Todas las fechas</option>
              <option value="TODAY">Hoy</option>
              <option value="WEEK">Última semana</option>
              <option value="MONTH">Último mes</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estado</TableHead>
                <TableHead>Destinatario</TableHead>
                <TableHead>Medio</TableHead>
                <TableHead>Asunto</TableHead>
                <TableHead>Noticia</TableHead>
                <TableHead>Enviado por</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmails.map((email) => (
                <TableRow key={email.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(email.status)}
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(email.status)}`}>
                        {getStatusLabel(email.status)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-start gap-2">
                      <Mail className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        {email.recipient_name && (
                          <div className="font-medium text-gray-900">{email.recipient_name}</div>
                        )}
                        <div className="text-sm text-gray-600">{email.recipient_email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {email.media?.name ? (
                      <div className="text-sm text-gray-900">{email.media.name}</div>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="max-w-xs">
                      <div className="text-sm text-gray-900 truncate">{email.subject}</div>
                      {email.error_message && (
                        <div className="text-xs text-red-600 mt-1">
                          Error: {email.error_message}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {email.news_submission?.title ? (
                      <div className="flex items-start gap-2">
                        <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-gray-900 max-w-xs truncate">
                          {email.news_submission.title}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {email.sender?.full_name ? (
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-900">{email.sender.full_name}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <div>
                        <div>{new Date(email.sent_at).toLocaleDateString()}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(email.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredEmails.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-500 py-12">
                    <Mail className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-lg font-medium">No se encontraron correos</p>
                    <p className="text-sm mt-1">
                      {searchTerm || statusFilter !== 'ALL' || dateFilter !== 'ALL'
                        ? 'Intenta ajustar los filtros'
                        : 'Los correos enviados aparecerán aquí'}
                    </p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
