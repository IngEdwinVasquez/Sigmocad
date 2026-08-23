import { useState, useEffect, useMemo, useRef } from 'react';
import { api, getPublicConfig } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Copy, Check } from 'lucide-react';

interface Media {
  id: string;
  name: string;
  public_key: string;
}

interface Slot {
  id: string;
  media_id: string;
  slug: string;
  width: number | null;
  height: number | null;
  media?: Media;
}

function normalizeUrl(u?: string) {
  if (!u) return '';
  return u.replace(/\/+$/, '');
}

export function Snippets() {
  const [media, setMedia] = useState<Media[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  const [serverUrl, setServerUrl] = useState('');
  const baseUrl = normalizeUrl(serverUrl);

  const previewRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    getPublicConfig()
      .then((cfg) => setServerUrl(cfg.publicUrl))
      .catch(() => setServerUrl(window.location.origin));
    fetchMedia();
  }, []);

  useEffect(() => {
    if (selectedMedia) fetchSlots(selectedMedia);
    setSelectedSlot('');
    setCopied(false);
  }, [selectedMedia]);

  const fetchMedia = async () => {
    setLoading(true);
    try {
      const data = await api.get<Media[]>('/api/media', { status: 'ACTIVE' });
      data.sort((a, b) => a.name.localeCompare(b.name));
      setMedia(data);
      if (data.length > 0) setSelectedMedia(data[0].id);
    } catch (error) {
      console.error('Error loading media:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSlots = async (mediaId: string) => {
    try {
      const data = await api.get<Slot[]>('/api/slots', { media_id: mediaId, status: 'ACTIVE' });
      data.sort((a, b) => a.slug.localeCompare(b.slug));
      setSlots(data);
      if (data.length > 0) setSelectedSlot(data[0].id);
      else setSelectedSlot('');
    } catch (error) {
      console.error('Error loading slots:', error);
    }
  };

  const currentMedia = useMemo(
    () => media.find((m) => m.id === selectedMedia),
    [media, selectedMedia]
  );
  const currentSlot = useMemo(
    () => slots.find((s) => s.id === selectedSlot),
    [slots, selectedSlot]
  );

  const snippet = useMemo(() => {
    if (!currentMedia || !currentSlot || !baseUrl) return '';
    const width = currentSlot.width || 300;
    const height = currentSlot.height || 250;

    const id = `gev-${currentSlot.slug}`;
    const url =
      `${baseUrl}/embed` +
      `?publicKey=${encodeURIComponent(currentMedia.public_key)}` +
      `&slot=${encodeURIComponent(currentSlot.slug)}` +
      `&format=html`;

    return `<iframe id="${id}" width="${width}" height="${height}" frameborder="0" scrolling="no"></iframe>
<script>
(function(){
  var URL_EMBED = ${JSON.stringify(url)};
  var el = document.getElementById(${JSON.stringify(id)});
  if(!el) return;
  fetch(URL_EMBED, { cache: "no-store" })
    .then(function(r){ return r.text(); })
    .then(function(html){ el.srcdoc = html; })
    .catch(function(err){ el.srcdoc = "<pre>"+String(err).replace(/</g,"&lt;")+"</pre>"; });
})();
</script>`;
  }, [currentMedia, currentSlot, baseUrl]);

  useEffect(() => {
    if (!currentMedia || !currentSlot || !baseUrl) return;

    const url =
      `${baseUrl}/embed` +
      `?publicKey=${encodeURIComponent(currentMedia.public_key)}` +
      `&slot=${encodeURIComponent(currentSlot.slug)}` +
      `&format=html`;

    const iframe = previewRef.current;
    if (!iframe) return;

    iframe.srcdoc = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font:12px sans-serif;color:#666">Cargando...</div>';

    const ac = new AbortController();

    fetch(url, { cache: 'no-store', signal: ac.signal })
      .then(async (r) => {
        const text = await r.text();
        if (!r.ok) {
          iframe.srcdoc = `<pre style="white-space:pre-wrap;font:12px/1.4 monospace;padding:8px">Error ${r.status}\n\n${text.replace(/</g, '&lt;')}</pre>`;
          return;
        }
        if (!text.trim()) {
          iframe.srcdoc = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font:14px sans-serif;color:#666;text-align:center;padding:20px">No hay campañas activas</div>';
          return;
        }

        const hasEmbeddedContent = text.includes('youtube.com') || text.includes('youtu.be') ||
                                   text.includes('twitter.com') || text.includes('instagram.com') ||
                                   text.includes('tiktok.com') || text.includes('facebook.com');

        if (hasEmbeddedContent) {
          iframe.srcdoc = text + `
            <script>
              window.addEventListener('error', function(e) {
                if (e.target.tagName === 'IFRAME') {
                  console.log('Iframe blocked by X-Frame-Options');
                }
              }, true);
            </script>
          `;
        } else {
          iframe.srcdoc = text;
        }
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        console.error('Fetch error:', err);
        iframe.srcdoc = `<pre style="white-space:pre-wrap;font:12px/1.4 monospace;padding:8px">Error de conexión:\n${String(err).replace(/</g, '&lt;')}</pre>`;
      });

    return () => {
      ac.abort();
      if (previewRef.current) previewRef.current.srcdoc = '';
    };
  }, [currentMedia, currentSlot, baseUrl]);

  const scriptSnippet = useMemo(() => {
    if (!currentMedia || !currentSlot || !baseUrl) return '';
    const width = currentSlot.width || 300;
    const height = currentSlot.height || 250;
    return `<div id="gev-${currentSlot.slug}"></div>
<script async src="${baseUrl}/e/${currentMedia.public_key}.js"
  data-slot="${currentSlot.slug}" data-width="${width}" data-height="${height}"></script>`;
  }, [currentMedia, currentSlot, baseUrl]);

  const [copiedScript, setCopiedScript] = useState(false);
  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(scriptSnippet);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Cargando...</div>
      </div>
    );
  }

  if (media.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No hay medios activos. Crea un medio primero.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Código de Integración</h2>
        <p className="text-gray-600 mt-1">Genera el código para integrar espacios publicitarios en tu sitio web</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Medio</label>
          <select
            value={selectedMedia}
            onChange={(e) => setSelectedMedia(e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {media.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Espacio Publicitario</label>
          <select
            value={selectedSlot}
            onChange={(e) => setSelectedSlot(e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={slots.length === 0}
          >
            {slots.length === 0 ? (
              <option>No hay espacios disponibles</option>
            ) : (
              slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.slug} ({s.width}x{s.height})
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {currentMedia && currentSlot && (
        <>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-gray-900">Código de Integración</h3>
              <Button variant="secondary" size="sm" onClick={copyToClipboard}>
                {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
            <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
              <code>{snippet}</code>
            </pre>
            <p className="text-sm text-gray-600 mt-2">
              Copia este código y pégalo en tu sitio web donde quieras mostrar el anuncio.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-gray-900">Alternativa: etiqueta &lt;script&gt;</h3>
              <Button variant="secondary" size="sm" onClick={copyScript}>
                {copiedScript ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                {copiedScript ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
            <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
              <code>{scriptSnippet}</code>
            </pre>
            <p className="text-sm text-gray-600 mt-2">
              Renderiza el anuncio directamente en la página (sin iframe) y registra impresiones y clics automáticamente.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Vista Previa</h3>
            <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
              <iframe
                ref={previewRef}
                className="w-full bg-white border border-gray-200 rounded"
                style={{ height: `${currentSlot.height || 250}px` }}
                title="Preview"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Nota:</strong> Algunos contenidos embebidos (YouTube, redes sociales, etc.) pueden no mostrarse correctamente en la vista previa debido a políticas de seguridad. El código funcionará correctamente cuando se implemente en tu sitio web.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
