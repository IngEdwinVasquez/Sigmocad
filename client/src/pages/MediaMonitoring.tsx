import { useState, useEffect } from 'react';
import { api, errorMessage } from '../lib/api';
import { useCompany } from '../lib/use-company';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import {
  Plus, Search, Tag, TrendingUp, ThumbsUp, ThumbsDown, AlertCircle, X, ExternalLink, Eye, EyeOff, Rss, RefreshCw, Trash2,
} from 'lucide-react';

interface Keyword {
  id: string;
  keyword: string;
  is_active: boolean;
  created_at: string;
}

interface Feed {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  last_fetched_at: string | null;
  last_error: string | null;
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
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<MonitoredArticle[]>([]);
  const [filteredArticles, setFilteredArticles] = useState<MonitoredArticle[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState<string>('ALL');
  const [readFilter, setReadFilter] = useState<string>('ALL');

  const [isKeywordModalOpen, setIsKeywordModalOpen] = useState(false);
  const [isFeedModalOpen, setIsFeedModalOpen] = useState(false);
  const [isSentimentModalOpen, setIsSentimentModalOpen] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [newFeed, setNewFeed] = useState({ name: '', url: '' });
  const [fetchingFeed, setFetchingFeed] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<MonitoredArticle | null>(null);
  const [sentimentForm, setSentimentForm] = useState({
    sentiment: '' as 'EXCELLENT' | 'GOOD' | 'BAD' | 'NEUTRAL' | '',
    notes: '',
  });

  const [activeTab, setActiveTab] = useState<'articles' | 'keywords' | 'feeds'>('articles');

  useEffect(() => {
    if (companyId) {
      fetchKeywords();
      fetchFeeds();
      fetchArticles();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articles, searchTerm, sentimentFilter, readFilter]);

  const fetchKeywords = async () => {
    try {
      setKeywords(await api.get<Keyword[]>('/api/monitoring/keywords'));
    } catch (err) {
      console.error('Error fetching keywords:', err);
      setKeywords([]);
    }
  };

  const fetchFeeds = async () => {
    try {
      setFeeds(await api.get<Feed[]>('/api/monitoring/feeds'));
    } catch (err) {
      console.error('Error fetching feeds:', err);
      setFeeds([]);
    }
  };

  const fetchArticles = async () => {
    setLoading(true);
    try {
      setArticles(await api.get<MonitoredArticle[]>('/api/monitoring/articles'));
    } catch (err) {
      console.error('Error fetching articles:', err);
      setArticles([]);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...articles];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (article) =>
          article.title.toLowerCase().includes(term) ||
          article.description?.toLowerCase().includes(term) ||
          article.source.toLowerCase().includes(term)
      );
    }

    if (sentimentFilter !== 'ALL') {
      if (sentimentFilter === 'UNRATED') {
        filtered = filtered.filter((article) => !article.sentiment);
      } else {
        filtered = filtered.filter((article) => article.sentiment === sentimentFilter);
      }
    }

    if (readFilter === 'READ') {
      filtered = filtered.filter((article) => article.read_status);
    } else if (readFilter === 'UNREAD') {
      filtered = filtered.filter((article) => !article.read_status);
    }

    setFilteredArticles(filtered);
  };

  const handleAddKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !newKeyword.trim()) return;
    try {
      await api.post('/api/monitoring/keywords', { keyword: newKeyword.trim() });
      setNewKeyword('');
      setIsKeywordModalOpen(false);
      fetchKeywords();
    } catch (error) {
      alert(errorMessage(error, 'Error al agregar palabra clave'));
    }
  };

  const handleToggleKeyword = async (keyword: Keyword) => {
    try {
      await api.patch(`/api/monitoring/keywords/${keyword.id}`, { is_active: !keyword.is_active });
      fetchKeywords();
    } catch (error) {
      console.error('Error toggling keyword:', error);
    }
  };

  const handleDeleteKeyword = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta palabra clave?')) return;
    try {
      await api.delete(`/api/monitoring/keywords/${id}`);
      fetchKeywords();
    } catch (error) {
      console.error('Error deleting keyword:', error);
    }
  };

  const handleAddFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !newFeed.url.trim()) return;
    try {
      await api.post('/api/monitoring/feeds', { name: newFeed.name.trim() || undefined, url: newFeed.url.trim() });
      setNewFeed({ name: '', url: '' });
      setIsFeedModalOpen(false);
      fetchFeeds();
    } catch (error) {
      alert(errorMessage(error, 'Error al agregar la fuente RSS'));
    }
  };

  const handleToggleFeed = async (feed: Feed) => {
    try {
      await api.patch(`/api/monitoring/feeds/${feed.id}`, { is_active: !feed.is_active });
      fetchFeeds();
    } catch (error) {
      console.error('Error toggling feed:', error);
    }
  };

  const handleDeleteFeed = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta fuente RSS?')) return;
    try {
      await api.delete(`/api/monitoring/feeds/${id}`);
      fetchFeeds();
    } catch (error) {
      console.error('Error deleting feed:', error);
    }
  };

  const handleFetchFeed = async (feed: Feed) => {
    setFetchingFeed(feed.id);
    try {
      const result = await api.post<{ processed: number; saved: number }>(`/api/monitoring/feeds/${feed.id}/fetch`);
      alert(`${feed.name}: ${result.processed} artículos leídos, ${result.saved} nuevos guardados`);
      fetchFeeds();
      fetchArticles();
    } catch (error) {
      alert(errorMessage(error, 'Error al consultar la fuente'));
    } finally {
      setFetchingFeed(null);
    }
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
    try {
      await api.patch(`/api/monitoring/articles/${selectedArticle.id}`, {
        sentiment: sentimentForm.sentiment || null,
        sentiment_notes: sentimentForm.notes || null,
        read_status: true,
      });
      setIsSentimentModalOpen(false);
      setSelectedArticle(null);
      fetchArticles();
    } catch (error) {
      alert(errorMessage(error, 'Error al actualizar sentimiento'));
    }
  };

  const handleToggleReadStatus = async (article: MonitoredArticle) => {
    try {
      await api.patch(`/api/monitoring/articles/${article.id}`, { read_status: !article.read_status });
      fetchArticles();
    } catch (error) {
      console.error('Error toggling read status:', error);
    }
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
    unread: articles.filter((a) => !a.read_status).length,
    excellent: articles.filter((a) => a.sentiment === 'EXCELLENT').length,
    good: articles.filter((a) => a.sentiment === 'GOOD').length,
    bad: articles.filter((a) => a.sentiment === 'BAD').length,
    unrated: articles.filter((a) => !a.sentiment).length,
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

  const tabClass = (tab: typeof activeTab) =>
    `px-6 py-3 text-sm font-medium ${activeTab === tab ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monitoreo de Medios</h1>
          <p className="text-gray-600 mt-1">Seguimiento de noticias por palabras clave desde fuentes RSS</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setIsFeedModalOpen(true)}>
            <Rss className="w-4 h-4 mr-2" />
            Agregar Fuente RSS
          </Button>
          <Button onClick={() => setIsKeywordModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Agregar Palabra Clave
          </Button>
        </div>
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
            <button onClick={() => setActiveTab('articles')} className={tabClass('articles')}>
              Noticias ({articles.length})
            </button>
            <button onClick={() => setActiveTab('keywords')} className={tabClass('keywords')}>
              Palabras Clave ({keywords.length})
            </button>
            <button onClick={() => setActiveTab('feeds')} className={tabClass('feeds')}>
              Fuentes RSS ({feeds.length})
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
                        <div className="mt-1">{getSentimentIcon(article.sentiment)}</div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 mb-1">{article.title}</h3>
                          {article.description && <p className="text-sm text-gray-600 mb-2">{article.description}</p>}
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span className="font-medium">{article.source}</span>
                            {article.published_at && <span>{new Date(article.published_at).toLocaleDateString()}</span>}
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
                      <Button variant="secondary" size="sm" onClick={() => handleOpenSentimentModal(article)}>
                        Calificar
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => handleToggleReadStatus(article)}>
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
                  <p className="text-sm mt-2">
                    Las noticias se agregarán automáticamente al detectar las palabras clave en las fuentes RSS configuradas
                  </p>
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
                          keyword.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {keyword.is_active ? 'Activa' : 'Inactiva'}
                      </button>
                    </TableCell>
                    <TableCell>{new Date(keyword.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button variant="secondary" size="sm" onClick={() => handleDeleteKeyword(keyword.id)}>
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

        {activeTab === 'feeds' && (
          <div className="p-6">
            <p className="text-sm text-gray-600 mb-4">
              El servidor consulta periódicamente estas fuentes RSS y guarda las noticias que coincidan con las palabras clave activas.
              También puede recibir artículos desde servicios externos mediante el webhook <code className="bg-gray-100 px-1 rounded">POST /api/rss-webhook</code>.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fuente</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Última consulta</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeds.map((feed) => (
                  <TableRow key={feed.id}>
                    <TableCell>
                      <span className="font-medium">{feed.name}</span>
                    </TableCell>
                    <TableCell>
                      <a href={feed.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs break-all">
                        {feed.url}
                      </a>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => handleToggleFeed(feed)}
                        className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${
                          feed.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {feed.is_active ? 'Activa' : 'Inactiva'}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">
                        {feed.last_fetched_at ? new Date(feed.last_fetched_at).toLocaleString('es-DO') : 'Nunca'}
                        {feed.last_error && <div className="text-red-600 mt-1">Error: {feed.last_error}</div>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleFetchFeed(feed)}
                          disabled={fetchingFeed === feed.id}
                          title="Consultar ahora"
                        >
                          <RefreshCw className={`w-4 h-4 ${fetchingFeed === feed.id ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => handleDeleteFeed(feed.id)} title="Eliminar">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {feeds.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                      No hay fuentes RSS configuradas. Agrega una para comenzar el monitoreo automático.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Modal isOpen={isKeywordModalOpen} onClose={() => setIsKeywordModalOpen(false)} title="Agregar Palabra Clave">
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
            <Button type="button" variant="secondary" onClick={() => setIsKeywordModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">Agregar</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isFeedModalOpen} onClose={() => setIsFeedModalOpen(false)} title="Agregar Fuente RSS">
        <form onSubmit={handleAddFeed} className="space-y-4">
          <Input
            label="Nombre (opcional)"
            placeholder="Diario Libre"
            value={newFeed.name}
            onChange={(e) => setNewFeed({ ...newFeed, name: e.target.value })}
          />
          <Input
            label="URL del feed RSS"
            placeholder="https://www.ejemplo.com/rss"
            value={newFeed.url}
            onChange={(e) => setNewFeed({ ...newFeed, url: e.target.value })}
            required
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsFeedModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">Agregar</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isSentimentModalOpen} onClose={() => setIsSentimentModalOpen(false)} title="Calificar Noticia">
        <form onSubmit={handleSaveSentiment} className="space-y-4">
          {selectedArticle && (
            <div className="mb-4">
              <h3 className="font-semibold text-gray-900 mb-2">{selectedArticle.title}</h3>
              <p className="text-sm text-gray-600">{selectedArticle.source}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Calificación</label>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { key: 'EXCELLENT', label: 'Excelente', icon: ThumbsUp, active: 'border-green-500 bg-green-50', idle: 'border-gray-200 hover:border-green-300', text: 'text-green-600' },
                  { key: 'GOOD', label: 'Buena', icon: TrendingUp, active: 'border-blue-500 bg-blue-50', idle: 'border-gray-200 hover:border-blue-300', text: 'text-blue-600' },
                  { key: 'BAD', label: 'Mala', icon: ThumbsDown, active: 'border-red-500 bg-red-50', idle: 'border-gray-200 hover:border-red-300', text: 'text-red-600' },
                  { key: 'NEUTRAL', label: 'Neutral', icon: AlertCircle, active: 'border-gray-500 bg-gray-50', idle: 'border-gray-200 hover:border-gray-300', text: 'text-gray-600' },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon;
                const active = sentimentForm.sentiment === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setSentimentForm({ ...sentimentForm, sentiment: opt.key })}
                    className={`p-4 border-2 rounded-lg text-center transition-all ${active ? opt.active : opt.idle}`}
                  >
                    <Icon className={`w-6 h-6 mx-auto mb-2 ${opt.text}`} />
                    <span className="text-sm font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Notas (opcional)</label>
            <textarea
              value={sentimentForm.notes}
              onChange={(e) => setSentimentForm({ ...sentimentForm, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Agrega notas sobre esta noticia..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsSentimentModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">Guardar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
