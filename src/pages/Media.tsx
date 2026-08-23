import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Plus, Edit2, Trash2, Upload, Download, CheckCircle2 } from 'lucide-react';
import { parseExcelFile, exportToExcel } from '../lib/excel-utils';
import { generatePDFReport } from '../lib/pdf-utils';

interface Media {
  id: string;
  name: string;
  public_key: string;
  domains: string[];
  status: 'ACTIVE' | 'PAUSED';
  has_ad_placement: boolean;
  provincia?: string;
  twitter_url?: string;
  instagram_url?: string;
  youtube_url?: string;
  tiktok_url?: string;
  sitemap_url?: string;
  whatsapp?: string;
  press_email?: string;
  banner_review_status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  publication_confirmed?: boolean;
  publication_confirmed_at?: string;
  created_at: string;
}

export function Media() {
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
  const [editingMedia, setEditingMedia] = useState<Media | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<Media | null>(null);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [verifyingMedia, setVerifyingMedia] = useState<Media | null>(null);
  const [newsUrl, setNewsUrl] = useState('');
  const [validatingSitemap, setValidatingSitemap] = useState(false);
  const [sitemapValidationMessage, setSitemapValidationMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    name: '',
    domains: '',
    status: 'ACTIVE' as 'ACTIVE' | 'PAUSED',
    has_ad_placement: false,
    provincia: '',
    twitter_url: '',
    instagram_url: '',
    youtube_url: '',
    tiktok_url: '',
    sitemap_url: '',
    whatsapp: '',
    press_email: '',
  });
  const { user } = useAuth();

  useEffect(() => {
    fetchMedia();
  }, []);

  const fetchMedia = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('media')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setMedia(data);
    }
    setLoading(false);
  };

  const generatePublicKey = () => {
    return 'pk_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  const validateSitemap = async (url: string) => {
    if (!url) return;

    setValidatingSitemap(true);
    setSitemapValidationMessage('');

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-url`;

      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      const result = await response.json();

      if (result.isValid) {
        setSitemapValidationMessage(`✓ Sitemap URL validado correctamente (${result.statusCode})`);
      } else if (result.error) {
        setSitemapValidationMessage(`✗ Error: ${result.error}`);
      } else {
        setSitemapValidationMessage(`⚠ Advertencia: No se pudo conectar al sitemap (${result.statusCode}: ${result.statusText})`);
      }
    } catch (error) {
      console.error('Validation error:', error);
      setSitemapValidationMessage('✗ Error: No se pudo validar el sitemap URL');
    } finally {
      setValidatingSitemap(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const domainsArray = formData.domains
      .split('\n')
      .map(d => d.trim())
      .filter(d => d.length > 0);

    const mediaData = {
      name: formData.name,
      domains: domainsArray,
      status: formData.status,
      has_ad_placement: formData.has_ad_placement,
      provincia: formData.provincia || null,
      twitter_url: formData.twitter_url || null,
      instagram_url: formData.instagram_url || null,
      youtube_url: formData.youtube_url || null,
      tiktok_url: formData.tiktok_url || null,
      sitemap_url: formData.sitemap_url || null,
      whatsapp: formData.whatsapp || null,
      press_email: formData.press_email || null,
    };

    if (editingMedia) {
      const { error } = await supabase
        .from('media')
        .update(mediaData)
        .eq('id', editingMedia.id);

      if (!error) {
        await fetchMedia();
        closeModal();
      }
    } else {
      const { error } = await supabase
        .from('media')
        .insert({
          ...mediaData,
          public_key: generatePublicKey(),
          created_by: user?.id,
        });

      if (!error) {
        await fetchMedia();
        closeModal();
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('¿Está seguro de que desea eliminar este medio?')) {
      const { error } = await supabase
        .from('media')
        .delete()
        .eq('id', id);

      if (!error) {
        await fetchMedia();
      }
    }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await parseExcelFile(file);

      const mediaToInsert = data.map(row => ({
        name: String(row.name || row.Name || ''),
        public_key: generatePublicKey(),
        domains: row.domains ? String(row.domains).split(',').map(d => d.trim()) : [],
        status: (row.status as string)?.toUpperCase() === 'PAUSED' ? 'PAUSED' : 'ACTIVE',
        has_ad_placement: row.has_ad_placement === true || String(row.has_ad_placement).toLowerCase() === 'true' || String(row.has_ad_placement).toLowerCase() === 'yes',
        twitter_url: row.twitter_url ? String(row.twitter_url) : null,
        instagram_url: row.instagram_url ? String(row.instagram_url) : null,
        youtube_url: row.youtube_url ? String(row.youtube_url) : null,
        tiktok_url: row.tiktok_url ? String(row.tiktok_url) : null,
        sitemap_url: row.sitemap_url ? String(row.sitemap_url) : null,
        created_by: user?.id,
      }));

      const { error } = await supabase
        .from('media')
        .insert(mediaToInsert);

      if (!error) {
        await fetchMedia();
        alert(`Se importaron exitosamente ${mediaToInsert.length} medios`);
      } else {
        alert('Error al importar medios: ' + error.message);
      }
    } catch (error) {
      alert('Error al leer el archivo Excel: ' + (error as Error).message);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExportExcel = () => {
    const exportData = media.map(item => ({
      NOMBRE: item.name,
      'COLOCACIÓN': item.has_ad_placement ? 'Sí' : 'No',
      ESTADO: item.status === 'ACTIVE' ? 'ACTIVO' : 'PAUSADO',
    }));

    exportToExcel(exportData, 'medios_exportacion');
  };

  const handleVerify = async (mediaItem: Media) => {
    setVerifyingMedia(mediaItem);
    setIsVerificationModalOpen(true);
    setVerificationResult(null);

    try {
      // Check if media has banner placement enabled
      if (!mediaItem.has_ad_placement) {
        setVerificationResult({
          success: false,
          message: 'Este medio no tiene habilitada la colocación publicitaria. Active esta opción primero.',
          slots: [],
        });
        return;
      }

      const { data: slots, error: slotsError } = await supabase
        .from('slots')
        .select('id, slug, status')
        .eq('media_id', mediaItem.id);

      if (slotsError) throw slotsError;

      if (!slots || slots.length === 0) {
        setVerificationResult({
          success: false,
          message: 'Este medio no tiene espacios asignados',
          slots: [],
        });
        return;
      }

      const slotResults = await Promise.all(
        slots.map(async (slot) => {
          try {
            const { data: assignments, error: assignError } = await supabase
              .from('assignments')
              .select('id, is_active, creative_id, creatives(name, type, status)')
              .eq('slot_id', slot.id);

            if (assignError) {
              console.error('Assignment error:', assignError);
              return {
                slot: slot.slug,
                slotStatus: slot.status,
                assignmentsCount: 0,
                activeAssignmentsCount: 0,
                status: slot.status === 'ACTIVE' ? 'info' : 'warning',
                message: slot.status === 'ACTIVE'
                  ? 'Espacio publicado (sin asignaciones por verificar)'
                  : 'Espacio inactivo',
              };
            }

            const activeAssignments = assignments?.filter((a) => a.is_active) || [];
            const hasActiveCreatives = activeAssignments.some(
              (a) => a.creatives && a.creatives.status === 'ACTIVE'
            );

            if (!assignments || assignments.length === 0) {
              return {
                slot: slot.slug,
                slotStatus: slot.status,
                assignmentsCount: 0,
                activeAssignmentsCount: 0,
                status: slot.status === 'ACTIVE' ? 'info' : 'warning',
                message: slot.status === 'ACTIVE'
                  ? 'Espacio publicado (sin campañas asignadas)'
                  : 'Espacio inactivo',
              };
            }

            return {
              slot: slot.slug,
              slotStatus: slot.status,
              assignmentsCount: assignments?.length || 0,
              activeAssignmentsCount: activeAssignments.length,
              hasActiveCreatives,
              status: slot.status === 'ACTIVE' && hasActiveCreatives ? 'ok' : slot.status === 'ACTIVE' ? 'info' : 'warning',
              message:
                slot.status === 'ACTIVE' && hasActiveCreatives
                  ? 'Funcionando correctamente con campañas activas'
                  : slot.status === 'ACTIVE' && activeAssignments.length > 0
                  ? 'Espacio publicado con asignaciones inactivas'
                  : slot.status === 'ACTIVE'
                  ? 'Espacio publicado sin asignaciones'
                  : slot.status !== 'ACTIVE'
                  ? 'Espacio inactivo'
                  : 'Sin campañas activas',
            };
          } catch (error) {
            console.error('Slot verification error:', error);
            return {
              slot: slot.slug,
              slotStatus: slot.status,
              assignmentsCount: 0,
              activeAssignmentsCount: 0,
              status: 'info',
              message: slot.status === 'ACTIVE'
                ? 'Espacio publicado (verificación parcial)'
                : 'Espacio inactivo',
            };
          }
        })
      );

      setVerificationResult({
        success: true,
        slots: slotResults,
        totalSlots: slots.length,
        workingSlots: slotResults.filter((r) => r.status === 'ok' || r.status === 'info').length,
      });
    } catch (error) {
      setVerificationResult({
        success: false,
        message: 'Error al verificar el medio: ' + (error as Error).message,
        slots: [],
      });
    }
  };

  const handleExportPDF = () => {
    const columns = [
      { header: 'NOMBRE', dataKey: 'nombre' },
      { header: 'COLOCACIÓN', dataKey: 'colocacion' },
      { header: 'ESTADO', dataKey: 'estado' },
    ];

    const exportData = media.map(item => ({
      nombre: item.name,
      colocacion: item.has_ad_placement ? 'Sí' : 'No',
      estado: item.status === 'ACTIVE' ? 'ACTIVO' : 'PAUSADO',
    }));

    generatePDFReport('Reporte de Medios', columns, exportData, 'reporte_medios');
  };

  const handleBannerReview = async (mediaId: string, status: 'APPROVED' | 'REJECTED') => {
    const { error } = await supabase
      .from('media')
      .update({ banner_review_status: status })
      .eq('id', mediaId);

    if (!error) {
      await fetchMedia();
      alert(`Banner ${status === 'APPROVED' ? 'aprobado' : 'rechazado'}`);
    }
  };

  const handlePublicationConfirmation = async (mediaId: string) => {
    const { error } = await supabase
      .from('media')
      .update({
        publication_confirmed: true,
        publication_confirmed_at: new Date().toISOString(),
      })
      .eq('id', mediaId);

    if (!error) {
      await fetchMedia();
      alert('Publicación confirmada');
    }
  };

  const openNewsModal = (mediaItem: Media) => {
    setSelectedMedia(mediaItem);
    setNewsUrl('');
    setIsNewsModalOpen(true);
  };

  const handleNewsVerification = async () => {
    if (!selectedMedia || !newsUrl) return;

    const { error } = await supabase
      .from('news_verification')
      .insert({
        media_id: selectedMedia.id,
        news_url: newsUrl,
        verified: true,
        verified_at: new Date().toISOString(),
        verification_method: 'MANUAL',
      });

    if (!error) {
      alert('URL de noticia verificada exitosamente');
      setIsNewsModalOpen(false);
      setNewsUrl('');
    } else {
      alert('Error al verificar noticia: ' + error.message);
    }
  };

  const openModal = (mediaItem?: Media) => {
    if (mediaItem) {
      setEditingMedia(mediaItem);
      setFormData({
        name: mediaItem.name,
        domains: mediaItem.domains.join('\n'),
        status: mediaItem.status,
        has_ad_placement: mediaItem.has_ad_placement,
        provincia: mediaItem.provincia || '',
        twitter_url: mediaItem.twitter_url || '',
        instagram_url: mediaItem.instagram_url || '',
        youtube_url: mediaItem.youtube_url || '',
        tiktok_url: mediaItem.tiktok_url || '',
        sitemap_url: mediaItem.sitemap_url || '',
        whatsapp: mediaItem.whatsapp || '',
        press_email: mediaItem.press_email || '',
      });
    } else {
      setEditingMedia(null);
      setFormData({
        name: '',
        domains: '',
        has_ad_placement: false,
        status: 'ACTIVE',
        provincia: '',
        twitter_url: '',
        instagram_url: '',
        youtube_url: '',
        tiktok_url: '',
        sitemap_url: '',
        whatsapp: '',
        press_email: '',
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingMedia(null);
    setSitemapValidationMessage('');
  };

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Medios Digitales</h1>
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
            Agregar Medio
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Provincia</TableHead>
              <TableHead>Colocación Publicitaria</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {media.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>
                  <span className="text-sm text-gray-600">
                    {item.provincia || '-'}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      item.has_ad_placement
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {item.has_ad_placement ? 'Sí' : 'No'}
                  </span>
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
                    <Button variant="ghost" size="sm" onClick={() => handleVerify(item)} title="Verificar">
                      <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    </Button>
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
        <form onSubmit={handleSubmit} className="space-y-4 max-h-96 overflow-y-auto">
          <Input
            label="Nombre"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            placeholder="Mi Sitio Web"
          />

          <Input
            label="Provincia"
            value={formData.provincia}
            onChange={(e) => setFormData({ ...formData, provincia: e.target.value })}
            placeholder="Santo Domingo"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dominios Permitidos (uno por línea)
            </label>
            <textarea
              value={formData.domains}
              onChange={(e) => setFormData({ ...formData, domains: e.target.value })}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="example.com&#10;www.example.com"
            />
          </div>

          <Input
            label="Twitter URL"
            value={formData.twitter_url}
            onChange={(e) => setFormData({ ...formData, twitter_url: e.target.value })}
            placeholder="https://twitter.com/username"
          />

          <Input
            label="Instagram URL"
            value={formData.instagram_url}
            onChange={(e) => setFormData({ ...formData, instagram_url: e.target.value })}
            placeholder="https://instagram.com/username"
          />

          <Input
            label="YouTube URL"
            value={formData.youtube_url}
            onChange={(e) => setFormData({ ...formData, youtube_url: e.target.value })}
            placeholder="https://youtube.com/@username"
          />

          <Input
            label="TikTok URL"
            value={formData.tiktok_url}
            onChange={(e) => setFormData({ ...formData, tiktok_url: e.target.value })}
            placeholder="https://tiktok.com/@username"
          />

          <div>
            <Input
              label="Sitemap URL"
              value={formData.sitemap_url}
              onChange={(e) => {
                setFormData({ ...formData, sitemap_url: e.target.value });
                setSitemapValidationMessage('');
              }}
              onBlur={(e) => {
                if (e.target.value && e.target.value.trim()) {
                  validateSitemap(e.target.value);
                }
              }}
              placeholder="https://example.com/sitemap.xml"
            />
            <div className="flex items-center gap-3 mt-2">
              {formData.sitemap_url && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => validateSitemap(formData.sitemap_url)}
                  disabled={validatingSitemap}
                >
                  {validatingSitemap ? 'Validando...' : 'Validar Sitemap'}
                </Button>
              )}
              {sitemapValidationMessage && (
                <p className={`text-sm flex-1 ${
                  sitemapValidationMessage.startsWith('✓') ? 'text-green-600 font-medium' :
                  sitemapValidationMessage.startsWith('⚠') ? 'text-yellow-600 font-medium' :
                  'text-red-600 font-medium'
                }`}>
                  {sitemapValidationMessage}
                </p>
              )}
            </div>
          </div>

          <Input
            label="WhatsApp"
            value={formData.whatsapp}
            onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
            placeholder="+1234567890"
          />

          <Input
            label="Correo de Prensa"
            type="email"
            value={formData.press_email}
            onChange={(e) => setFormData({ ...formData, press_email: e.target.value })}
            placeholder="prensa@ejemplo.com"
          />

          <div>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.has_ad_placement}
                onChange={(e) => setFormData({ ...formData, has_ad_placement: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Tiene colocación publicitaria
              </span>
            </label>
            <p className="text-xs text-gray-500 mt-1 ml-6">
              Indica si este medio tiene capacidad para mostrar anuncios publicitarios
            </p>
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

      <Modal
        isOpen={isNewsModalOpen}
        onClose={() => setIsNewsModalOpen(false)}
        title="Verificar URL de Noticia"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setIsNewsModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleNewsVerification}>
              Verificar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Verificando noticia para: <strong>{selectedMedia?.name}</strong>
          </p>
          <Input
            label="URL de Noticia"
            value={newsUrl}
            onChange={(e) => setNewsUrl(e.target.value)}
            required
            placeholder="https://example.com/article"
          />
        </div>
      </Modal>

      <Modal
        isOpen={isVerificationModalOpen}
        onClose={() => setIsVerificationModalOpen(false)}
        title={`Verificación: ${verifyingMedia?.name}`}
        footer={
          <div className="flex gap-2 justify-end">
            <Button onClick={() => setIsVerificationModalOpen(false)}>
              Cerrar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {!verificationResult ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-blue-600 mb-4"></div>
                <p className="text-slate-600">Verificando asignaciones...</p>
              </div>
            </div>
          ) : verificationResult.success ? (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-blue-900">Resumen</h3>
                  <span className="text-2xl font-bold text-blue-600">
                    {verificationResult.workingSlots} / {verificationResult.totalSlots}
                  </span>
                </div>
                <p className="text-sm text-blue-700">
                  Espacios publicados y operativos
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-slate-900">Detalle por Espacio:</h4>
                {verificationResult.slots.map((slot: any, index: number) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border ${
                      slot.status === 'ok'
                        ? 'bg-green-50 border-green-200'
                        : slot.status === 'info'
                        ? 'bg-blue-50 border-blue-200'
                        : slot.status === 'warning'
                        ? 'bg-yellow-50 border-yellow-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{slot.slot}</p>
                        <p className="text-sm text-slate-600 mt-1">{slot.message}</p>
                        {slot.assignmentsCount !== undefined && slot.assignmentsCount > 0 && (
                          <p className="text-xs text-slate-500 mt-1">
                            {slot.activeAssignmentsCount} de {slot.assignmentsCount} asignaciones activas
                          </p>
                        )}
                      </div>
                      <div
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          slot.status === 'ok'
                            ? 'bg-green-600 text-white'
                            : slot.status === 'info'
                            ? 'bg-blue-600 text-white'
                            : slot.status === 'warning'
                            ? 'bg-yellow-600 text-white'
                            : 'bg-red-600 text-white'
                        }`}
                      >
                        {slot.status === 'ok' ? '✓ OK' : slot.status === 'info' ? 'ℹ Publicado' : slot.status === 'warning' ? '⚠ Advertencia' : '✗ Error'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 font-medium">Error</p>
              <p className="text-red-600 text-sm mt-1">{verificationResult.message}</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
