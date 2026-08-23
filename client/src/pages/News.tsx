import { useState, useEffect, useRef } from 'react';
import { api, errorMessage, getPublicConfig } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Plus, CheckCircle2, XCircle, Loader2, Eye, Send, X, Trash2, Edit } from 'lucide-react';

interface News {
  id: string;
  title: string;
  created_at: string;
  last_verified_at: string | null;
  verification_status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
}

interface Media {
  id: string;
  name: string;
  has_ad_placement: boolean;
  press_email?: string;
  whatsapp?: string;
}

interface VerificationResult {
  media_id: string;
  media_name: string;
  verified: boolean;
  verified_at: string | null;
  news_url?: string;
  verified_on_website?: boolean;
  website_url?: string;
  verified_on_instagram?: boolean;
  instagram_url?: string;
  verified_on_twitter?: boolean;
  twitter_url?: string;
  verified_on_youtube?: boolean;
  youtube_url?: string;
  verified_on_tiktok?: boolean;
  tiktok_url?: string;
}

export function News() {
  const { user } = useAuth();
  const [news, setNews] = useState<News[]>([]);
  const [smtpConfigured, setSmtpConfigured] = useState(true);
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [editingNews, setEditingNews] = useState<News | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [viewingResults, setViewingResults] = useState<string | null>(null);
  const [verificationResults, setVerificationResults] = useState<VerificationResult[]>([]);
  const [sending, setSending] = useState(false);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [submissionForm, setSubmissionForm] = useState({
    title: '',
    description: '',
    recipientFilter: 'ALL' as 'ALL' | 'WITH_PLACEMENT' | 'WITHOUT_PLACEMENT',
  });
  const [uploadedDocument, setUploadedDocument] = useState<File | null>(null);
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);

  useEffect(() => {
    loadNews();
    loadMedia();
    getPublicConfig()
      .then((cfg) => setSmtpConfigured(cfg.smtpConfigured))
      .catch(() => setSmtpConfigured(false));
  }, []);

  const loadNews = async () => {
    try {
      setNews(await api.get<News[]>('/api/news'));
    } catch (error) {
      console.error('Error loading news:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMedia = async () => {
    try {
      const data = await api.get<Media[]>('/api/media', { status: 'ACTIVE' });
      data.sort((a, b) => a.name.localeCompare(b.name));
      setMedia(data);
    } catch (error) {
      console.error('Error loading media:', error);
    }
  };

  const handleCreateNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !user) return;

    try {
      if (editingNews) {
        await api.put(`/api/news/${editingNews.id}`, { title: newTitle });
      } else {
        await api.post('/api/news', { title: newTitle });
      }

      setNewTitle('');
      setEditingNews(null);
      setIsModalOpen(false);
      loadNews();
    } catch (error) {
      alert(errorMessage(error, 'Error al guardar la noticia'));
    }
  };

  const handleEditNews = (newsItem: News) => {
    setEditingNews(newsItem);
    setNewTitle(newsItem.title);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingNews(null);
    setNewTitle('');
  };

  const handleVerifyNews = async (newsId: string) => {
    setVerifying(newsId);

    try {
      // The server checks sitemap, homepage and social profiles of every active media outlet
      await api.post(`/api/news/${newsId}/verify`);
      loadNews();
    } catch (error) {
      alert(errorMessage(error, 'Error al verificar la noticia'));
    } finally {
      setVerifying(null);
    }
  };

  const handleViewResults = async (newsId: string) => {
    setViewingResults(newsId);

    try {
      setVerificationResults(await api.get<VerificationResult[]>(`/api/news/${newsId}/verifications`));
    } catch (error) {
      console.error('Error loading verification results:', error);
    }
  };

  const closeResultsModal = () => {
    setViewingResults(null);
    setVerificationResults([]);
  };

  const handleDeleteNews = async (newsId: string) => {
    if (!confirm('¿Está seguro de que desea eliminar esta noticia? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      await api.delete(`/api/news/${newsId}`);
      alert('Noticia eliminada exitosamente');
      loadNews();
    } catch (error) {
      alert(errorMessage(error, 'Error al eliminar la noticia'));
    }
  };

  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];

    if (!allowedTypes.includes(file.type)) {
      alert('Solo se permiten archivos PDF, Word (.doc, .docx) o texto (.txt)');
      return;
    }

    setUploadedDocument(file);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    if (uploadedImages.length + files.length > 3) {
      alert('Solo se permiten hasta 3 imágenes');
      return;
    }

    const validImages = files.filter(file => file.type.startsWith('image/'));

    if (validImages.length !== files.length) {
      alert('Algunos archivos no son imágenes válidas');
    }

    setUploadedImages(prev => [...prev, ...validImages].slice(0, 3));
  };

  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  const getFilteredMedia = () => {
    switch (submissionForm.recipientFilter) {
      case 'WITH_PLACEMENT':
        return media.filter(m => m.has_ad_placement);
      case 'WITHOUT_PLACEMENT':
        return media.filter(m => !m.has_ad_placement);
      default:
        return media;
    }
  };

  const handleSendToMedia = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!uploadedDocument) {
      alert('Debe subir un documento (PDF, Word o Texto)');
      return;
    }

    if (uploadedImages.length === 0) {
      alert('Debe subir al menos una imagen');
      return;
    }

    setSending(true);

    try {
      const form = new FormData();
      form.append('title', submissionForm.title);
      form.append('description', submissionForm.description || '');
      form.append('recipientFilter', submissionForm.recipientFilter);
      form.append('document', uploadedDocument);
      uploadedImages.forEach((img) => form.append('images', img));

      // Uploads the files, stores the submission and e-mails every selected media outlet
      const result = await api.upload<{
        recipients: number;
        withoutEmail: number;
        sent: number;
        failed: number;
        smtpConfigured: boolean;
      }>('/api/news/send', form);

      alert(
        `Noticia enviada:\n✓ ${result.sent} correos enviados exitosamente\n` +
          (result.failed > 0 ? `✗ ${result.failed} correos fallaron\n` : '') +
          `${result.withoutEmail} medios sin correo configurado` +
          (!result.smtpConfigured ? '\n\n(El servidor no tiene SMTP configurado; revise el archivo .env)' : '')
      );
      setIsSendModalOpen(false);
      resetSendForm();
    } catch (error) {
      alert(errorMessage(error, 'Error al enviar la noticia'));
    } finally {
      setSending(false);
    }
  };

  const resetSendForm = () => {
    setSubmissionForm({
      title: '',
      description: '',
      recipientFilter: 'ALL',
    });
    setUploadedDocument(null);
    setUploadedImages([]);
    if (documentInputRef.current) documentInputRef.current.value = '';
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const publishedResults = verificationResults.filter(r => r.verified);
  const notPublishedResults = verificationResults.filter(r => !r.verified);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Noticias</h1>
          <p className="text-slate-600 mt-1">Gestiona y verifica noticias en todos los medios</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setIsSendModalOpen(true)}>
            <Send className="w-4 h-4 mr-2" />
            Enviar a Medios
          </Button>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva Noticia
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Título</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Estado</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Última Verificación</th>
              <th className="px-6 py-4 text-right text-sm font-semibold text-slate-700">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {news.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                  No hay noticias creadas
                </td>
              </tr>
            ) : (
              news.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-slate-900 font-medium">{item.title}</td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                        item.verification_status === 'COMPLETED'
                          ? 'bg-green-100 text-green-700'
                          : item.verification_status === 'IN_PROGRESS'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {item.verification_status === 'COMPLETED' && <CheckCircle2 className="w-3 h-3" />}
                      {item.verification_status === 'IN_PROGRESS' && <Loader2 className="w-3 h-3 animate-spin" />}
                      {item.verification_status === 'COMPLETED'
                        ? 'Verificado'
                        : item.verification_status === 'IN_PROGRESS'
                        ? 'Verificando'
                        : 'Pendiente'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {item.last_verified_at
                      ? new Date(item.last_verified_at).toLocaleString('es-DO')
                      : 'Nunca'}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <Button
                      size="sm"
                      onClick={() => handleVerifyNews(item.id)}
                      disabled={verifying === item.id}
                    >
                      {verifying === item.id ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Verificando...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Validar
                        </>
                      )}
                    </Button>
                    {item.verification_status === 'COMPLETED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewResults(item.id)}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Ver Resultados
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditNews(item)}
                    >
                      <Edit className="w-4 h-4 text-blue-600" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteNews(item.id)}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingNews ? "Editar Noticia" : "Nueva Noticia"}>
        <form onSubmit={handleCreateNews} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Título de la Noticia
            </label>
            <Input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Ingrese el título de la noticia"
              required
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button type="submit" className="flex-1">
              {editingNews ? 'Actualizar Noticia' : 'Crear Noticia'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseModal}
              className="flex-1"
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isSendModalOpen}
        onClose={() => {
          setIsSendModalOpen(false);
          resetSendForm();
        }}
        title="Enviar Noticia a Medios"
      >
        <form onSubmit={handleSendToMedia} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Título
            </label>
            <Input
              type="text"
              value={submissionForm.title}
              onChange={(e) => setSubmissionForm({...submissionForm, title: e.target.value})}
              placeholder="Título de la noticia"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Descripción
            </label>
            <textarea
              value={submissionForm.description}
              onChange={(e) => setSubmissionForm({...submissionForm, description: e.target.value})}
              placeholder="Descripción o contenido adicional"
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={4}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Documento (PDF, Word o Texto)
            </label>
            <input
              ref={documentInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              onChange={handleDocumentUpload}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              required
            />
            {uploadedDocument && (
              <p className="text-sm text-green-600 mt-1">
                ✓ {uploadedDocument.name}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Imágenes (Máximo 3)
            </label>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {uploadedImages.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {uploadedImages.map((img, idx) => (
                  <div key={idx} className="relative">
                    <img
                      src={URL.createObjectURL(img)}
                      alt={`Preview ${idx + 1}`}
                      className="w-20 h-20 object-cover rounded border"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Enviar a
            </label>
            <select
              value={submissionForm.recipientFilter}
              onChange={(e) => setSubmissionForm({...submissionForm, recipientFilter: e.target.value as any})}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Todos los medios ({media.length})</option>
              <option value="WITH_PLACEMENT">Solo con colocación ({media.filter(m => m.has_ad_placement).length})</option>
              <option value="WITHOUT_PLACEMENT">Solo sin colocación ({media.filter(m => !m.has_ad_placement).length})</option>
            </select>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              Se enviará a <strong>{getFilteredMedia().length}</strong> medio(s)
            </p>
          </div>

          {!smtpConfigured && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                El servidor no tiene configurado el envío de correos (SMTP). La noticia se guardará pero los correos no se enviarán.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button type="submit" className="flex-1" disabled={sending}>
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Enviar
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsSendModalOpen(false);
                resetSendForm();
              }}
              className="flex-1"
              disabled={sending}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={viewingResults !== null}
        onClose={closeResultsModal}
        title="Resultados de Verificación"
      >
        <div className="space-y-6">
          {verificationResults.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500">No hay medios configurados o aún no se ha ejecutado la validación.</p>
            </div>
          ) : (
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-4">
                Verificación de Publicación en Medios ({verificationResults.length})
              </h3>
              <div className="space-y-3">
                {verificationResults.map((result) => (
                  <div
                    key={result.media_id}
                    className="p-4 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      {result.verified ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-slate-400" />
                      )}
                      <p className="font-semibold text-slate-900">{result.media_name}</p>
                    </div>

                    <div className="grid grid-cols-5 gap-2 mb-2">
                      <div className="text-center">
                        <div className="text-xs font-medium text-slate-600 mb-1">Web</div>
                        {result.verified_on_website ? (
                          <CheckCircle2 className="w-6 h-6 text-green-600 mx-auto" />
                        ) : (
                          <XCircle className="w-6 h-6 text-red-500 mx-auto" />
                        )}
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-medium text-slate-600 mb-1">Instagram</div>
                        {result.verified_on_instagram ? (
                          <CheckCircle2 className="w-6 h-6 text-green-600 mx-auto" />
                        ) : (
                          <XCircle className="w-6 h-6 text-red-500 mx-auto" />
                        )}
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-medium text-slate-600 mb-1">X (Twitter)</div>
                        {result.verified_on_twitter ? (
                          <CheckCircle2 className="w-6 h-6 text-green-600 mx-auto" />
                        ) : (
                          <XCircle className="w-6 h-6 text-red-500 mx-auto" />
                        )}
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-medium text-slate-600 mb-1">YouTube</div>
                        {result.verified_on_youtube ? (
                          <CheckCircle2 className="w-6 h-6 text-green-600 mx-auto" />
                        ) : (
                          <XCircle className="w-6 h-6 text-red-500 mx-auto" />
                        )}
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-medium text-slate-600 mb-1">TikTok</div>
                        {result.verified_on_tiktok ? (
                          <CheckCircle2 className="w-6 h-6 text-green-600 mx-auto" />
                        ) : (
                          <XCircle className="w-6 h-6 text-red-500 mx-auto" />
                        )}
                      </div>
                    </div>

                    {(result.website_url || result.instagram_url || result.twitter_url || result.youtube_url || result.tiktok_url) && (
                      <div className="space-y-1 text-xs border-t border-slate-200 pt-2 mt-2">
                        {result.website_url && (
                          <a href={result.website_url} target="_blank" rel="noopener noreferrer" className="block text-blue-600 hover:text-blue-800 underline truncate">
                            Web: {result.website_url}
                          </a>
                        )}
                        {result.instagram_url && (
                          <a href={result.instagram_url} target="_blank" rel="noopener noreferrer" className="block text-blue-600 hover:text-blue-800 underline truncate">
                            Instagram: {result.instagram_url}
                          </a>
                        )}
                        {result.twitter_url && (
                          <a href={result.twitter_url} target="_blank" rel="noopener noreferrer" className="block text-blue-600 hover:text-blue-800 underline truncate">
                            X: {result.twitter_url}
                          </a>
                        )}
                        {result.youtube_url && (
                          <a href={result.youtube_url} target="_blank" rel="noopener noreferrer" className="block text-blue-600 hover:text-blue-800 underline truncate">
                            YouTube: {result.youtube_url}
                          </a>
                        )}
                        {result.tiktok_url && (
                          <a href={result.tiktok_url} target="_blank" rel="noopener noreferrer" className="block text-blue-600 hover:text-blue-800 underline truncate">
                            TikTok: {result.tiktok_url}
                          </a>
                        )}
                      </div>
                    )}

                    {result.verified_at && (
                      <p className="text-xs text-slate-600 mt-2 pt-2 border-t border-slate-200">
                        Verificado: {new Date(result.verified_at).toLocaleString('es-DO')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="hidden">
            <h3 className="text-lg font-semibold text-green-700 mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Publicado en ({publishedResults.length})
            </h3>
            {publishedResults.length === 0 ? (
              <p className="text-sm text-slate-500">No se encontró en ningún medio</p>
            ) : (
              <ul className="space-y-2">
                {publishedResults.map((result) => (
                  <li
                    key={result.media_id}
                    className="p-4 bg-green-50 border border-green-200 rounded-lg"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <p className="font-semibold text-slate-900">{result.media_name}</p>
                    </div>

                    <div className="grid grid-cols-5 gap-2 mb-2">
                      <div className="text-center">
                        <div className="text-xs font-medium text-slate-600 mb-1">Web</div>
                        {result.verified_on_website ? (
                          <CheckCircle2 className="w-6 h-6 text-green-600 mx-auto" />
                        ) : (
                          <XCircle className="w-6 h-6 text-red-500 mx-auto" />
                        )}
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-medium text-slate-600 mb-1">Instagram</div>
                        {result.verified_on_instagram ? (
                          <CheckCircle2 className="w-6 h-6 text-green-600 mx-auto" />
                        ) : (
                          <XCircle className="w-6 h-6 text-red-500 mx-auto" />
                        )}
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-medium text-slate-600 mb-1">X (Twitter)</div>
                        {result.verified_on_twitter ? (
                          <CheckCircle2 className="w-6 h-6 text-green-600 mx-auto" />
                        ) : (
                          <XCircle className="w-6 h-6 text-red-500 mx-auto" />
                        )}
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-medium text-slate-600 mb-1">YouTube</div>
                        {result.verified_on_youtube ? (
                          <CheckCircle2 className="w-6 h-6 text-green-600 mx-auto" />
                        ) : (
                          <XCircle className="w-6 h-6 text-red-500 mx-auto" />
                        )}
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-medium text-slate-600 mb-1">TikTok</div>
                        {result.verified_on_tiktok ? (
                          <CheckCircle2 className="w-6 h-6 text-green-600 mx-auto" />
                        ) : (
                          <XCircle className="w-6 h-6 text-red-500 mx-auto" />
                        )}
                      </div>
                    </div>

                    <div className="space-y-1 text-xs">
                      {result.website_url && (
                        <a href={result.website_url} target="_blank" rel="noopener noreferrer" className="block text-blue-600 hover:text-blue-800 underline truncate">
                          Web: {result.website_url}
                        </a>
                      )}
                      {result.instagram_url && (
                        <a href={result.instagram_url} target="_blank" rel="noopener noreferrer" className="block text-blue-600 hover:text-blue-800 underline truncate">
                          Instagram: {result.instagram_url}
                        </a>
                      )}
                      {result.twitter_url && (
                        <a href={result.twitter_url} target="_blank" rel="noopener noreferrer" className="block text-blue-600 hover:text-blue-800 underline truncate">
                          X: {result.twitter_url}
                        </a>
                      )}
                      {result.youtube_url && (
                        <a href={result.youtube_url} target="_blank" rel="noopener noreferrer" className="block text-blue-600 hover:text-blue-800 underline truncate">
                          YouTube: {result.youtube_url}
                        </a>
                      )}
                      {result.tiktok_url && (
                        <a href={result.tiktok_url} target="_blank" rel="noopener noreferrer" className="block text-blue-600 hover:text-blue-800 underline truncate">
                          TikTok: {result.tiktok_url}
                        </a>
                      )}
                    </div>

                    {result.verified_at && (
                      <p className="text-xs text-slate-600 mt-2 pt-2 border-t border-green-200">
                        Verificado: {new Date(result.verified_at).toLocaleString('es-DO')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="hidden">
            <h3 className="text-lg font-semibold text-red-700 mb-3 flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              No Publicado en ({notPublishedResults.length})
            </h3>
            {notPublishedResults.length === 0 ? (
              <p className="text-sm text-slate-500">Todos los medios publicaron esta noticia</p>
            ) : (
              <ul className="space-y-2">
                {notPublishedResults.map((result) => (
                  <li
                    key={result.media_id}
                    className="p-4 bg-red-50 border border-red-200 rounded-lg"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <XCircle className="w-5 h-5 text-red-600" />
                      <p className="font-semibold text-slate-900">{result.media_name}</p>
                    </div>

                    <div className="grid grid-cols-5 gap-2">
                      <div className="text-center">
                        <div className="text-xs font-medium text-slate-600 mb-1">Web</div>
                        <XCircle className="w-6 h-6 text-red-500 mx-auto" />
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-medium text-slate-600 mb-1">Instagram</div>
                        <XCircle className="w-6 h-6 text-red-500 mx-auto" />
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-medium text-slate-600 mb-1">X (Twitter)</div>
                        <XCircle className="w-6 h-6 text-red-500 mx-auto" />
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-medium text-slate-600 mb-1">YouTube</div>
                        <XCircle className="w-6 h-6 text-red-500 mx-auto" />
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-medium text-slate-600 mb-1">TikTok</div>
                        <XCircle className="w-6 h-6 text-red-500 mx-auto" />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="pt-4">
            <Button onClick={closeResultsModal} className="w-full">
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
