import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { FileDown, Search, Filter, MonitorPlay, Radio, Tv, CheckCircle2, XCircle } from 'lucide-react';
import { exportToExcel } from '../lib/excel-utils';
import { exportToPDF } from '../lib/pdf-utils';

interface MediaReport {
  id: string;
  name: string;
  type: 'DIGITAL' | 'TV' | 'RADIO';
  provincia?: string;
  url?: string;
  channel?: string;
  schedule?: string;
  whatsapp?: string;
  press_email?: string;
  hasContract: boolean;
  contractStartDate?: string;
  contractEndDate?: string;
  status: string;
}

interface ColumnConfig {
  key: keyof MediaReport;
  label: string;
  enabled: boolean;
}

export function MediaReports() {
  const [mediaReports, setMediaReports] = useState<MediaReport[]>([]);
  const [filteredReports, setFilteredReports] = useState<MediaReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [filters, setFilters] = useState({
    mediaType: 'ALL' as 'ALL' | 'DIGITAL' | 'TV' | 'RADIO',
    contractStatus: 'ALL' as 'ALL' | 'WITH_CONTRACT' | 'WITHOUT_CONTRACT',
    provincia: 'ALL',
  });

  const [columns, setColumns] = useState<ColumnConfig[]>([
    { key: 'name', label: 'Nombre', enabled: true },
    { key: 'type', label: 'Tipo', enabled: true },
    { key: 'provincia', label: 'Provincia', enabled: true },
    { key: 'url', label: 'URL', enabled: true },
    { key: 'channel', label: 'Canal/Frecuencia', enabled: true },
    { key: 'schedule', label: 'Horario', enabled: true },
    { key: 'whatsapp', label: 'WhatsApp', enabled: false },
    { key: 'press_email', label: 'Email de Prensa', enabled: false },
    { key: 'hasContract', label: 'Tiene Contrato', enabled: true },
    { key: 'contractStartDate', label: 'Inicio Contrato', enabled: true },
    { key: 'contractEndDate', label: 'Fin Contrato', enabled: true },
    { key: 'status', label: 'Estado', enabled: true },
  ]);

  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [provincias, setProvincias] = useState<string[]>([]);

  useEffect(() => {
    fetchMediaReports();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [mediaReports, searchTerm, filters]);

  const fetchMediaReports = async () => {
    setLoading(true);

    const { data: digitalMedia } = await supabase
      .from('media')
      .select('id, name, provincia, status, domains, whatsapp, press_email');

    const { data: traditionalMedia } = await supabase
      .from('traditional_media')
      .select('id, name, provincia, channel, schedule, media_type, status');

    const { data: slots } = await supabase
      .from('slots')
      .select(`
        id,
        media_id,
        assignments (
          start_at,
          end_at,
          is_active
        )
      `);

    const reports: MediaReport[] = [];
    const provinciaSet = new Set<string>();

    if (digitalMedia) {
      digitalMedia.forEach((media) => {
        const mediaSlots = slots?.filter(s => s.media_id === media.id) || [];
        const activeAssignments = mediaSlots
          .flatMap(s => s.assignments || [])
          .filter(a => a.is_active);

        const hasContract = activeAssignments.length > 0;
        const latestAssignment = activeAssignments.sort(
          (a, b) => new Date(b.start_at || 0).getTime() - new Date(a.start_at || 0).getTime()
        )[0];

        if (media.provincia) provinciaSet.add(media.provincia);

        reports.push({
          id: media.id,
          name: media.name,
          type: 'DIGITAL',
          provincia: media.provincia,
          url: media.domains?.[0] || undefined,
          whatsapp: media.whatsapp,
          press_email: media.press_email,
          hasContract,
          contractStartDate: latestAssignment?.start_at,
          contractEndDate: latestAssignment?.end_at,
          status: media.status || 'ACTIVE',
        });
      });
    }

    if (traditionalMedia) {
      traditionalMedia.forEach((media) => {
        if (media.provincia) provinciaSet.add(media.provincia);

        reports.push({
          id: media.id,
          name: media.name,
          type: media.media_type as 'TV' | 'RADIO',
          provincia: media.provincia,
          channel: media.channel,
          schedule: media.schedule,
          hasContract: false,
          status: media.status || 'ACTIVE',
        });
      });
    }

    setProvincias(Array.from(provinciaSet).sort());
    setMediaReports(reports);
    setLoading(false);
  };

  const applyFilters = () => {
    let filtered = [...mediaReports];

    if (searchTerm) {
      filtered = filtered.filter(media =>
        media.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        media.provincia?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filters.mediaType !== 'ALL') {
      filtered = filtered.filter(media => media.type === filters.mediaType);
    }

    if (filters.contractStatus === 'WITH_CONTRACT') {
      filtered = filtered.filter(media => media.hasContract);
    } else if (filters.contractStatus === 'WITHOUT_CONTRACT') {
      filtered = filtered.filter(media => !media.hasContract);
    }

    if (filters.provincia !== 'ALL') {
      filtered = filtered.filter(media => media.provincia === filters.provincia);
    }

    setFilteredReports(filtered);
  };

  const toggleColumn = (key: keyof MediaReport) => {
    setColumns(columns.map(col =>
      col.key === key ? { ...col, enabled: !col.enabled } : col
    ));
  };

  const getEnabledColumns = () => columns.filter(col => col.enabled);

  const exportToExcelFile = () => {
    const enabledCols = getEnabledColumns();
    const data = filteredReports.map(report => {
      const row: any = {};
      enabledCols.forEach(col => {
        if (col.key === 'hasContract') {
          row[col.label] = report[col.key] ? 'Sí' : 'No';
        } else if (col.key === 'contractStartDate' || col.key === 'contractEndDate') {
          row[col.label] = report[col.key]
            ? new Date(report[col.key]!).toLocaleDateString()
            : '-';
        } else {
          row[col.label] = report[col.key] || '-';
        }
      });
      return row;
    });

    exportToExcel(data, 'reporte-medios');
  };

  const exportToPDFFile = () => {
    const enabledCols = getEnabledColumns();
    const headers = enabledCols.map(col => col.label);
    const data = filteredReports.map(report =>
      enabledCols.map(col => {
        if (col.key === 'hasContract') {
          return report[col.key] ? 'Sí' : 'No';
        } else if (col.key === 'contractStartDate' || col.key === 'contractEndDate') {
          return report[col.key]
            ? new Date(report[col.key]!).toLocaleDateString()
            : '-';
        } else {
          return String(report[col.key] || '-');
        }
      })
    );

    exportToPDF(headers, data, 'Reporte de Medios');
  };

  const getMediaIcon = (type: string) => {
    switch (type) {
      case 'DIGITAL':
        return <MonitorPlay className="w-5 h-5 text-blue-600" />;
      case 'TV':
        return <Tv className="w-5 h-5 text-purple-600" />;
      case 'RADIO':
        return <Radio className="w-5 h-5 text-green-600" />;
      default:
        return null;
    }
  };

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reporte de Medios</h1>
        <div className="flex gap-2">
          <Button onClick={() => setShowColumnSelector(!showColumnSelector)} variant="secondary">
            <Filter className="w-4 h-4 mr-2" />
            Personalizar Columnas
          </Button>
          <Button onClick={exportToExcelFile} variant="secondary">
            <FileDown className="w-4 h-4 mr-2" />
            Exportar Excel
          </Button>
          <Button onClick={exportToPDFFile} variant="secondary">
            <FileDown className="w-4 h-4 mr-2" />
            Exportar PDF
          </Button>
        </div>
      </div>

      {showColumnSelector && (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <h3 className="font-semibold text-gray-900 mb-3">Seleccionar Columnas</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {columns.map((col) => (
              <label key={col.key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={col.enabled}
                  onChange={() => toggleColumn(col.key)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              placeholder="Buscar por nombre o provincia..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <select
            value={filters.mediaType}
            onChange={(e) => setFilters({ ...filters, mediaType: e.target.value as any })}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">Todos los tipos</option>
            <option value="DIGITAL">Medios Digitales</option>
            <option value="TV">Televisión</option>
            <option value="RADIO">Radio</option>
          </select>

          <select
            value={filters.contractStatus}
            onChange={(e) => setFilters({ ...filters, contractStatus: e.target.value as any })}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">Todos los contratos</option>
            <option value="WITH_CONTRACT">Con contrato</option>
            <option value="WITHOUT_CONTRACT">Sin contrato</option>
          </select>

          <select
            value={filters.provincia}
            onChange={(e) => setFilters({ ...filters, provincia: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">Todas las provincias</option>
            {provincias.map((prov) => (
              <option key={prov} value={prov}>{prov}</option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex gap-4 text-sm text-gray-600">
          <span>Total: <strong>{filteredReports.length}</strong></span>
          <span>Con contrato: <strong>{filteredReports.filter(m => m.hasContract).length}</strong></span>
          <span>Sin contrato: <strong>{filteredReports.filter(m => !m.hasContract).length}</strong></span>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {getEnabledColumns().map((col) => (
                <TableHead key={col.key}>{col.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredReports.map((report) => (
              <TableRow key={report.id}>
                {getEnabledColumns().map((col) => (
                  <TableCell key={col.key}>
                    {col.key === 'name' && (
                      <div className="flex items-center gap-2">
                        {getMediaIcon(report.type)}
                        <span className="font-medium">{report.name}</span>
                      </div>
                    )}
                    {col.key === 'type' && <span className="font-medium">{report.type}</span>}
                    {col.key === 'hasContract' && (
                      <div className="flex items-center gap-1">
                        {report.hasContract ? (
                          <>
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                            <span className="text-green-700 font-medium">Sí</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-5 h-5 text-red-600" />
                            <span className="text-red-700 font-medium">No</span>
                          </>
                        )}
                      </div>
                    )}
                    {col.key === 'contractStartDate' && (
                      <span>{report.contractStartDate ? new Date(report.contractStartDate).toLocaleDateString() : '-'}</span>
                    )}
                    {col.key === 'contractEndDate' && (
                      <span>{report.contractEndDate ? new Date(report.contractEndDate).toLocaleDateString() : '-'}</span>
                    )}
                    {col.key === 'url' && report.url && (
                      <a href={`https://${report.url}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {report.url}
                      </a>
                    )}
                    {col.key === 'status' && (
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        report.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {report.status}
                      </span>
                    )}
                    {!['name', 'type', 'hasContract', 'contractStartDate', 'contractEndDate', 'url', 'status'].includes(col.key) && (
                      <span>{report[col.key] || '-'}</span>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {filteredReports.length === 0 && (
              <TableRow>
                <TableCell colSpan={getEnabledColumns().length} className="text-center py-8 text-gray-500">
                  No se encontraron medios con los filtros seleccionados
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
