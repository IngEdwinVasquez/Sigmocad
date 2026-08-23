import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { useCompany } from '../lib/use-company';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Plus, CheckCircle2, XCircle, Loader2, Eye, Send, Upload, X, Trash2, Edit } from 'lucide-react';

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
  const { companyId } = useCompany();
  const [news, setNews] = useState<News[]>([]);
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
  }, []);

  const loadNews = async () => {
    try {
      const { data, error } = await supabase
        .from('news')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNews(data || []);
    } catch (error) {
      console.error('Error loading news:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMedia = async () => {
    try {
      const { data, error } = await supabase
        .from('media')
        .select('id, name, has_ad_placement, press_email, whatsapp')
        .eq('status', 'ACTIVE')
        .order('name');

      if (error) throw error;
      setMedia(data || []);
    } catch (error) {
      console.error('Error loading media:', error);
    }
  };

  const handleCreateNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !user) return;

    try {
      if (editingNews) {
        // Update existing news
        const { error } = await supabase
          .from('news')
          .update({ title: newTitle })
          .eq('id', editingNews.id);

        if (error) throw error;
      } else {
        // Create new news
        const { error } = await supabase.from('news').insert({
          title: newTitle,
          created_by: user.id,
        });

        if (error) throw error;
      }

      setNewTitle('');
      setEditingNews(null);
      setIsModalOpen(false);
      loadNews();
    } catch (error) {
      console.error('Error saving news:', error);
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

  const handleVerifyNews = async (newsId: string, newsTitle: string) => {
    setVerifying(newsId);

    try {
      await supabase
        .from('news')
        .update({ verification_status: 'IN_PROGRESS' })
        .eq('id', newsId);

      const { data: { session } } = await supabase.auth.getSession();
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-news`;

      const verifications: VerificationResult[] = [];

      // Get full media info with sitemap and social media URLs
      const { data: fullMedia, error: mediaError } = await supabase
        .from('media')
        .select('id, name, sitemap_url, domains, instagram_url, twitter_url, youtube_url, tiktok_url')
        .eq('status', 'ACTIVE');

      if (mediaError) {
        console.error('Error fetching media:', mediaError);
        throw mediaError;
      }

      for (const mediaOutlet of fullMedia || []) {
        try {
          // Call edge function to verify news
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session?.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              newsTitle,
              mediaId: mediaOutlet.id,
              sitemapUrl: mediaOutlet.sitemap_url,
              domains: mediaOutlet.domains,
              socialMediaUrls: {
                instagram_url: mediaOutlet.instagram_url,
                twitter_url: mediaOutlet.twitter_url,
                youtube_url: mediaOutlet.youtube_url,
                tiktok_url: mediaOutlet.tiktok_url,
              },
            }),
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json();

          const isVerified = result.verified_on_website ||
                            result.verified_on_instagram ||
                            result.verified_on_twitter ||
                            result.verified_on_youtube ||
                            result.verified_on_tiktok;

          // Save verification result
          const { error } = await supabase.from('news_verification').upsert({
            news_id: newsId,
            media_id: mediaOutlet.id,
            news_url: result.website_url || null,
            verified: isVerified,
            verified_at: isVerified ? new Date().toISOString() : null,
            verification_method: result.method,
            verified_on_website: result.verified_on_website || false,
            website_url: result.website_url || null,
            verified_on_instagram: result.verified_on_instagram || false,
            instagram_url: result.instagram_url || null,
            verified_on_twitter: result.verified_on_twitter || false,
            twitter_url: result.twitter_url || null,
            verified_on_youtube: result.verified_on_youtube || false,
            youtube_url: result.youtube_url || null,
            verified_on_tiktok: result.verified_on_tiktok || false,
            tiktok_url: result.tiktok_url || null,
          }, {
            onConflict: 'news_id,media_id',
          });

          if (error) console.error('Error saving verification:', error);

          verifications.push({
            media_id: mediaOutlet.id,
            media_name: mediaOutlet.name,
            verified: isVerified,
            verified_at: isVerified ? new Date().toISOString() : null,
            verified_on_website: result.verified_on_website,
            website_url: result.website_url,
            verified_on_instagram: result.verified_on_instagram,
            instagram_url: result.instagram_url,
            verified_on_twitter: result.verified_on_twitter,
            twitter_url: result.twitter_url,
            verified_on_youtube: result.verified_on_youtube,
            youtube_url: result.youtube_url,
            verified_on_tiktok: result.verified_on_tiktok,
            tiktok_url: result.tiktok_url,
          });
        } catch (error) {
          console.error(`Error verifying ${mediaOutlet.name}:`, error);
          verifications.push({
            media_id: mediaOutlet.id,
            media_name: mediaOutlet.name,
            verified: false,
            verified_at: null,
          });
        }
      }

      await supabase
        .from('news')
        .update({
          verification_status: 'COMPLETED',
          last_verified_at: new Date().toISOString(),
        })
        .eq('id', newsId);

      loadNews();
    } catch (error) {
      console.error('Error verifying news:', error);
    } finally {
      setVerifying(null);
    }
  };


  const handleViewResults = async (newsId: string) => {
    setViewingResults(newsId);

    try {
      const { data: verificationData, error: verificationError } = await supabase
        .from('news_verification')
        .select(`
          media_id,
          verified,
          verified_at,
          news_url,
          verified_on_website,
          website_url,
          verified_on_instagram,
          instagram_url,
          verified_on_twitter,
          twitter_url,
          verified_on_youtube,
          youtube_url,
          verified_on_tiktok,
          tiktok_url
        `)
        .eq('news_id', newsId);

      if (verificationError) throw verificationError;

      const verificationMap = new Map(
        (verificationData || []).map(v => [v.media_id, v])
      );

      const results: VerificationResult[] = media.map((mediaItem) => {
        const verification = verificationMap.get(mediaItem.id);

        return {
          media_id: mediaItem.id,
          media_name: mediaItem.name,
          verified: verification?.verified || false,
          verified_at: verification?.verified_at || null,
          news_url: verification?.news_url,
          verified_on_website: verification?.verified_on_website || false,
          website_url: verification?.website_url,
          verified_on_instagram: verification?.verified_on_instagram || false,
          instagram_url: verification?.instagram_url,
          verified_on_twitter: verification?.verified_on_twitter || false,
          twitter_url: verification?.twitter_url,
          verified_on_youtube: verification?.verified_on_youtube || false,
          youtube_url: verification?.youtube_url,
          verified_on_tiktok: verification?.verified_on_tiktok || false,
          tiktok_url: verification?.tiktok_url,
        };
      });

      setVerificationResults(results);
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
      // Delete verification records first (foreign key constraint)
      await supabase
        .from('news_verification')
        .delete()
        .eq('news_id', newsId);

      // Delete the news
      const { error } = await supabase
        .from('news')
        .delete()
        .eq('id', newsId);

      if (error) throw error;

      alert('Noticia eliminada exitosamente');
      loadNews();
    } catch (error) {
      console.error('Error deleting news:', error);
      alert('Error al eliminar la noticia: ' + (error as Error).message);
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
      // Upload document to storage
      const timestamp = Date.now();
      const documentPath = `news-documents/${timestamp}-${uploadedDocument.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

      const { error: docError } = await supabase.storage
        .from('news-files')
        .upload(documentPath, uploadedDocument, {
          cacheControl: '3600',
          upsert: false
        });

      if (docError) {
        console.error('Error uploading document:', docError);
        throw new Error(`Error al subir documento: ${docError.message}`);
      }

      const { data: { publicUrl: documentUrl } } = supabase.storage
        .from('news-files')
        .getPublicUrl(documentPath);

      // Upload images to storage
      const imageUrls: string[] = [];
      for (let i = 0; i < uploadedImages.length; i++) {
        const image = uploadedImages[i];
        const imagePath = `news-images/${timestamp}-${i}-${image.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

        const { error: imgError } = await supabase.storage
          .from('news-files')
          .upload(imagePath, image, {
            cacheControl: '3600',
            upsert: false
          });

        if (imgError) {
          console.error(`Error uploading image ${i}:`, imgError);
          throw new Error(`Error al subir imagen ${i + 1}: ${imgError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from('news-files')
          .getPublicUrl(imagePath);

        imageUrls.push(publicUrl);
      }

      // Get filtered media recipients
      const recipients = getFilteredMedia();
      const recipientIds = recipients.map(m => m.id);

      // Save submission to database
      const { error: insertError } = await supabase
        .from('news_submissions')
        .insert({
          title: submissionForm.title,
          description: submissionForm.description,
          document_url: documentUrl,
          document_type: uploadedDocument.type,
          image_urls: imageUrls,
          recipient_filter: submissionForm.recipientFilter,
          media_recipients: recipientIds,
          created_by: user?.id,
          company_id: companyId,
        });

      if (insertError) throw insertError;

      // Send emails to media outlets
      const emailApiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-news-email`;
      const emailHeaders = {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      };

      let successCount = 0;
      let errorCount = 0;

      for (const mediaOutlet of recipients) {
        if (!mediaOutlet.press_email) {
          console.warn(`${mediaOutlet.name} no tiene correo configurado`);
          continue;
        }

        try {
          const response = await fetch(emailApiUrl, {
            method: 'POST',
            headers: emailHeaders,
            body: JSON.stringify({
              to: mediaOutlet.press_email,
              toName: mediaOutlet.name,
              subject: submissionForm.title,
              title: submissionForm.title,
              description: submissionForm.description || '',
              documentUrl: documentUrl,
              documentType: uploadedDocument.type,
              imageUrls: imageUrls,
              companyId: companyId,
              newsSubmissionId: newsSubmissionId,
              mediaId: mediaOutlet.id,
              sentBy: user?.id,
            }),
          });

          const result = await response.json();

          if (result.success) {
            successCount++;
          } else {
            errorCount++;
            console.error(`Error enviando a ${mediaOutlet.name}:`, result.error);
          }
        } catch (error) {
          errorCount++;
          console.error(`Error enviando a ${mediaOutlet.name}:`, error);
        }
      }

      const recipientsWithEmail = recipients.filter(m => m.press_email).length;
      alert(`Noticia enviada:\n✓ ${successCount} correos enviados exitosamente\n${errorCount > 0 ? `✗ ${errorCount} correos fallaron\n` : ''}${recipients.length - recipientsWithEmail} medios sin correo configurado`);
      setIsSendModalOpen(false);
      resetSendForm();
    } catch (error) {
      console.error('Error sending news:', error);
      alert('Error al enviar la noticia: ' + (error as Error).message);
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
                      onClick={() => handleVerifyNews(item.id, item.title)}
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
