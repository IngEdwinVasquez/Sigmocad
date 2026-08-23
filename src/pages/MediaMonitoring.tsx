import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useCompany } from '../lib/use-company';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Plus, Search, Tag, TrendingUp, ThumbsUp, ThumbsDown, AlertCircle, X, ExternalLink, Eye, EyeOff } from 'lucide-react';

interface Keyword {
  id: string;
  keyword: string;
  is_active: boolean;
  created_at: string;
}

interface MonitoredArticle {
  id: string;
  title: string;
  description: string | null;
  url: string;
  source: string;
  published_at: string | null;
  discovered_at: string;
  matched_keywords: string[];
  sentiment: 'EXCELLENT' | 'GOOD' | 'BAD' | 'NEUTRAL' | null;
  sentiment_notes: string | null;
  read_status: boolean;
}

export function MediaMonitoring() {
  const { companyId } = useCompany();
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [articles, setArticles] = useState<MonitoredArticle[]>([]);
  const [filteredArticles, setFilteredArticles] = useState<MonitoredArticle[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState<string>('ALL');
  const [readFilter, setReadFilter] = useState<string>('ALL');

  const [isKeywordModalOpen, setIsKeywordModalOpen] = useState(false);
  const [isSentimentModalOpen, setIsSentimentModalOpen] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<MonitoredArticle | null>(null);
  const [sentimentForm, setSentimentForm] = useState({
    sentiment: '' as 'EXCELLENT' | 'GOOD' | 'BAD' | 'NEUTRAL' | '',
    notes: '',
  });

  const [activeTab, setActiveTab] = useState<'articles' | 'keywords'>('articles');

  useEffect(() => {
    if (companyId) {
      fetchKeywords();
      fetchArticles();
    } else {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    applyFilters();
  }, [articles, searchTerm, sentimentFilter, readFilter]);

  const fetchKeywords = async () => {
    if (!companyId) {
      setKeywords([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('monitoring_keywords')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching keywords:', error);
        setKeywords([]);
        return;
      }

      if (data) {
        setKeywords(data);
      }
    } catch (err) {
      console.error('Exception fetching keywords:', err);
      setKeywords([]);
    }
  };

  const fetchArticles = async () => {
    if (!companyId) {
      setLoading(false);
      setArticles([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('monitored_articles')
        .select('*')
        .eq('company_id', companyId)
        .order('discovered_at', { ascending: false });

      if (error) {
        console.error('Error fetching articles:', error);
        setArticles([]);
        setLoading(false);
        return;
      }

      if (data) {
        setArticles(data);
      }
    } catch (err) {
      console.error('Exception fetching articles:', err);
      setArticles([]);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...articles];

    if (searchTerm) {
      filtered = filtered.filter(article =>
        article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        article.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        article.source.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (sentimentFilter !== 'ALL') {
      if (sentimentFilter === 'UNRATED') {
        filtered = filtered.filter(article => !article.sentiment);
      } else {
        filtered = filtered.filter(article => article.sentiment === sentimentFilter);
      }
    }

    if (readFilter === 'READ') {
      filtered = filtered.filter(article => article.read_status);
    } else if (readFilter === 'UNREAD') {
      filtered = filtered.filter(article => !article.read_status);
    }

    setFilteredArticles(filtered);
  };

  const handleAddKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !newKeyword.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('monitoring_keywords')
      .insert([{
        company_id: companyId,
        keyword: newKeyword.trim(),
        created_by: user?.id,
      }]);

    if (error) {
      console.error('Error adding keyword:', error);
      alert('Error al agregar palabra clave');
      return;
    }

    setNewKeyword('');
    setIsKeywordModalOpen(false);
    fetchKeywords();
  };

  const handleToggleKeyword = async (keyword: Keyword) => {
    const { error } = await supabase
      .from('monitoring_keywords')
      .update({ is_active: !keyword.is_active })
      .eq('id', keyword.id);

    if (error) {
      console.error('Error toggling keyword:', error);
      return;
    }

    fetchKeywords();
  };

  const handleDeleteKeyword = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta palabra clave?')) return;

    const { error } = await supabase
      .from('monitoring_keywords')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting keyword:', error);
      return;
    }

    fetchKeywords();
  };

  const handleOpenSentimentModal = (article: MonitoredArticle) => {
    setSelectedArticle(article);
    setSentimentForm({
      sentiment: article.sentiment || '',
      notes: article.sentiment_notes || '',
    });
    setIsSentimentModalOpen(true);
  };

  const handleSaveSentiment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedArticle) return;

    const { error } = await supabase
      .from('monitored_articles')
      .update({
        sentiment: sentimentForm.sentiment || null,
        sentiment_notes: sentimentForm.notes || null,
        read_status: true,
      })
      .eq('id', selectedArticle.id);

    if (error) {
      console.error('Error updating sentiment:', error);
      alert('Error al actualizar sentimiento');
      return;
    }

    setIsSentimentModalOpen(false);
    setSelectedArticle(null);
    fetchArticles();
  };

  const handleToggleReadStatus = async (article: MonitoredArticle) => {
    const { error } = await supabase
      .from('monitored_articles')
      .update({ read_status: !article.read_status })
      .eq('id', article.id);

    if (error) {
      console.error('Error toggling read status:', error);
      return;
    }

    fetchArticles();
  };

  const getSentimentIcon = (sentiment: string | null) => {
    switch (sentiment) {
      case 'EXCELLENT':
        return <ThumbsUp className="w-5 h-5 text-green-600" />;
      case 'GOOD':
        return <TrendingUp className="w-5 h-5 text-blue-600" />;
      case 'BAD':
        return <ThumbsDown className="w-5 h-5 text-red-600" />;
      case 'NEUTRAL':
        return <AlertCircle className="w-5 h-5 text-gray-600" />;
      default:
        return <span className="text-xs text-gray-400">Sin calificar</span>;
    }
  };

  const getSentimentBadge = (sentiment: string | null) => {
    switch (sentiment) {
      case 'EXCELLENT':
        return 'bg-green-100 text-green-800';
      case 'GOOD':
        return 'bg-blue-100 text-blue-800';
      case 'BAD':
        return 'bg-red-100 text-red-800';
      case 'NEUTRAL':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getSentimentLabel = (sentiment: string | null) => {
    switch (sentiment) {
      case 'EXCELLENT':
        return 'Excelente';
      case 'GOOD':
        return 'Buena';
      case 'BAD':
        return 'Mala';
      case 'NEUTRAL':
        return 'Neutral';
      default:
        return 'Sin calificar';
    }
  };

  const stats = {
    total: articles.length,
    unread: articles.filter(a => !a.read_status).length,
    excellent: articles.filter(a => a.sentiment === 'EXCELLENT').length,
    good: articles.filter(a => a.sentiment === 'GOOD').length,
    bad: articles.filter(a => a.sentiment === 'BAD').length,
    unrated: articles.filter(a => !a.sentiment).length,
  };

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  if (!companyId) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="text-lg font-medium text-gray-900">No hay empresa seleccionada</p>
        <p className="text-sm text-gray-600 mt-2">Selecciona una empresa para ver el monitoreo de medios</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monitoreo de Medios</h1>
          <p className="text-gray-600 mt-1">Seguimiento de noticias por palabras clave desde RSS feeds</p>
        </div>
        <Button onClick={() => setIsKeywordModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Agregar Palabra Clave
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs text-gray-600">Total Noticias</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.unread}</p>
            <p className="text-xs text-gray-600">Sin Revisar</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{stats.excellent}</p>
            <p className="text-xs text-gray-600">Excelentes</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-500">{stats.good}</p>
            <p className="text-xs text-gray-600">Buenas</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600">{stats.bad}</p>
            <p className="text-xs text-gray-600">Malas</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-yellow-600">{stats.unrated}</p>
            <p className="text-xs text-gray-600">Sin Calificar</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex">
            <button
              onClick={() => setActiveTab('articles')}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === 'articles'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Noticias ({articles.length})
            </button>
            <button
              onClick={() => setActiveTab('keywords')}
              className={`px-6 py-3 text-sm font-medium ${
                activeTab === 'keywords'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Palabras Clave ({keywords.length})
            </button>
          </nav>
        </div>

        {activeTab === 'articles' && (
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="relative col-span-2">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  placeholder="Buscar por título, descripción o fuente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <select
                value={sentimentFilter}
                onChange={(e) => setSentimentFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">Todos los sentimientos</option>
                <option value="EXCELLENT">Excelente</option>
                <option value="GOOD">Buena</option>
                <option value="BAD">Mala</option>
                <option value="NEUTRAL">Neutral</option>
                <option value="UNRATED">Sin calificar</option>
              </select>

              <select
                value={readFilter}
                onChange={(e) => setReadFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">Todos</option>
                <option value="READ">Revisadas</option>
                <option value="UNREAD">Sin revisar</option>
              </select>
            </div>

            <div className="space-y-4">
              {filteredArticles.map((article) => (
                <div
                  key={article.id}
                  className={`border rounded-lg p-4 hover:shadow-md transition-shadow ${
                    !article.read_status ? 'bg-blue-50 border-blue-200' : 'bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-start gap-3 mb-2">
                        <div className="mt-1">
                          {getSentimentIcon(article.sentiment)}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 mb-1">{article.title}</h3>
                          {article.description && (
                            <p className="text-sm text-gray-600 mb-2">{article.description}</p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span className="font-medium">{article.source}</span>
                            {article.published_at && (
                              <span>{new Date(article.published_at).toLocaleDateString()}</span>
                            )}
                            <a
                              href={article.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline flex items-center gap-1"
                            >
                              Ver noticia <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          {article.matched_keywords.length > 0 && (
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <Tag className="w-4 h-4 text-gray-400" />
                              {article.matched_keywords.map((keyword, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded"
                                >
                                  {keyword}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${getSentimentBadge(article.sentiment)}`}>
                        {getSentimentLabel(article.sentiment)}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenSentimentModal(article)}
                      >
                        Calificar
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleToggleReadStatus(article)}
                      >
                        {article.read_status ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  {article.sentiment_notes && (
                    <div className="mt-3 p-3 bg-gray-50 rounded text-sm text-gray-700">
                      <strong>Notas:</strong> {article.sentiment_notes}
                    </div>
                  )}
                </div>
              ))}
              {filteredArticles.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <p>No se encontraron noticias con los filtros seleccionados</p>
                  <p className="text-sm mt-2">Las noticias se agregarán automáticamente al detectar las palabras clave en los RSS feeds</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'keywords' && (
          <div className="p-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Palabra Clave</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha de Creación</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keywords.map((keyword) => (
                  <TableRow key={keyword.id}>
                    <TableCell>
                      <span className="font-medium">{keyword.keyword}</span>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => handleToggleKeyword(keyword)}
                        className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${
                          keyword.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {keyword.is_active ? 'Activa' : 'Inactiva'}
                      </button>
                    </TableCell>
                    <TableCell>
                      {new Date(keyword.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDeleteKeyword(keyword.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {keywords.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                      No hay palabras clave configuradas. Agrega una para comenzar el monitoreo.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Modal
        isOpen={isKeywordModalOpen}
        onClose={() => setIsKeywordModalOpen(false)}
        title="Agregar Palabra Clave"
      >
        <form onSubmit={handleAddKeyword} className="space-y-4">
          <Input
            label="Palabra o Frase Clave"
            placeholder='Ejemplo: DIDA, "Dirección General de Información"'
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            required
          />
          <p className="text-xs text-gray-600">
            Puedes agregar palabras simples o frases completas entre comillas para búsquedas exactas.
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsKeywordModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit">
              Agregar
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isSentimentModalOpen}
        onClose={() => setIsSentimentModalOpen(false)}
        title="Calificar Noticia"
      >
        <form onSubmit={handleSaveSentiment} className="space-y-4">
          {selectedArticle && (
            <div className="mb-4">
              <h3 className="font-semibold text-gray-900 mb-2">{selectedArticle.title}</h3>
              <p className="text-sm text-gray-600">{selectedArticle.source}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Calificación
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSentimentForm({ ...sentimentForm, sentiment: 'EXCELLENT' })}
                className={`p-4 border-2 rounded-lg text-center transition-all ${
                  sentimentForm.sentiment === 'EXCELLENT'
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 hover:border-green-300'
                }`}
              >
                <ThumbsUp className="w-6 h-6 mx-auto mb-2 text-green-600" />
                <span className="text-sm font-medium">Excelente</span>
              </button>
              <button
                type="button"
                onClick={() => setSentimentForm({ ...sentimentForm, sentiment: 'GOOD' })}
                className={`p-4 border-2 rounded-lg text-center transition-all ${
                  sentimentForm.sentiment === 'GOOD'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <TrendingUp className="w-6 h-6 mx-auto mb-2 text-blue-600" />
                <span className="text-sm font-medium">Buena</span>
              </button>
              <button
                type="button"
                onClick={() => setSentimentForm({ ...sentimentForm, sentiment: 'BAD' })}
                className={`p-4 border-2 rounded-lg text-center transition-all ${
                  sentimentForm.sentiment === 'BAD'
                    ? 'border-red-500 bg-red-50'
                    : 'border-gray-200 hover:border-red-300'
                }`}
              >
                <ThumbsDown className="w-6 h-6 mx-auto mb-2 text-red-600" />
                <span className="text-sm font-medium">Mala</span>
              </button>
              <button
                type="button"
                onClick={() => setSentimentForm({ ...sentimentForm, sentiment: 'NEUTRAL' })}
                className={`p-4 border-2 rounded-lg text-center transition-all ${
                  sentimentForm.sentiment === 'NEUTRAL'
                    ? 'border-gray-500 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <AlertCircle className="w-6 h-6 mx-auto mb-2 text-gray-600" />
                <span className="text-sm font-medium">Neutral</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notas (opcional)
            </label>
            <textarea
              value={sentimentForm.notes}
              onChange={(e) => setSentimentForm({ ...sentimentForm, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Agrega notas sobre esta noticia..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsSentimentModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit">
              Guardar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
