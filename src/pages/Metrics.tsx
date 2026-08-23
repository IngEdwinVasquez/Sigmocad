import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { LineChart, Line, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { Download, TrendingUp, MousePointer, Eye, Target, Award, Clock, Calendar, Activity, Zap, Users, Globe, Smartphone, Monitor, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { exportToExcel } from '../lib/excel-utils';
import { generatePDFReport } from '../lib/pdf-utils';

interface Metric {
  id: number;
  type: 'IMPRESSION' | 'CLICK';
  creative_id?: string;
  slot_id?: string;
  media_id?: string;
  user_agent?: string;
  ip?: string;
  referrer?: string;
  sentiment_label?: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | null;
  sentiment_score?: number | null;
  country?: string | null;
  city?: string | null;
  region?: string | null;
  created_at: string;
}

interface Creative {
  id: string;
  name: string;
}

interface Slot {
  id: string;
  slug: string;
}

interface Media {
  id: string;
  name: string;
}

interface AggregatedMetric {
  date: string;
  impressions: number;
  clics: number;
  alcance: number;
}

interface HourlyMetric {
  hour: string;
  impressions: number;
  clics: number;
}

interface PerformanceData {
  name: string;
  impressions: number;
  clics: number;
}

interface ComparisonData {
  current: { impressions: number; clics: number };
  previous: { impressions: number; clics: number };
}

interface LocationData {
  name: string;
  impressions: number;
  clics: number;
}

interface CityData {
  name: string;
  impressions: number;
  clics: number;
}

export function Metrics() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMediaId, setSelectedMediaId] = useState<string>('all');

  const [aggregated, setAggregated] = useState<AggregatedMetric[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyMetric[]>([]);
  const [topCreatives, setTopCreatives] = useState<PerformanceData[]>([]);
  const [topSlots, setTopSlots] = useState<PerformanceData[]>([]);
  const [topMedia, setTopMedia] = useState<PerformanceData[]>([]);
  const [deviceData, setDeviceData] = useState<{ name: string; value: number }[]>([]);
  const [locationData, setLocationData] = useState<LocationData[]>([]);
  const [cityData, setCityData] = useState<CityData[]>([]);
  const [comparison, setComparison] = useState<ComparisonData>({
    current: { impressions: 0, clics: 0 },
    previous: { impressions: 0, clics: 0 },
  });

  const [summary, setSummary] = useState({
    totalImpressions: 0,
    totalClics: 0,
    uniqueUsers: 0,
    avgAlcance: 0,
    totalAlcance: 0,
    uniqueCountries: 0,
  });

  useEffect(() => {
    fetchAllData();
  }, [startDate, endDate, selectedMediaId]);

  const fetchAllData = async () => {
    setLoading(true);

    const startDateTime = new Date(startDate).toISOString();
    const endDateTime = new Date(new Date(endDate).setHours(23, 59, 59)).toISOString();

    let metricsQuery = supabase
      .from('metrics')
      .select('*')
      .gte('created_at', startDateTime)
      .lte('created_at', endDateTime);

    if (selectedMediaId !== 'all') {
      metricsQuery = metricsQuery.eq('media_id', selectedMediaId);
    }

    const [metricsRes, creativesRes, slotsRes, mediaRes] = await Promise.all([
      metricsQuery.order('created_at', { ascending: true }),
      supabase.from('creatives').select('id, name'),
      supabase.from('slots').select('id, slug'),
      supabase.from('media').select('id, name'),
    ]);

    if (!metricsRes.error && metricsRes.data) {
      setMetrics(metricsRes.data);
      processMetrics(metricsRes.data);
    }

    if (!creativesRes.error && creativesRes.data) setCreatives(creativesRes.data);
    if (!slotsRes.error && slotsRes.data) setSlots(slotsRes.data);
    if (!mediaRes.error && mediaRes.data) setMedia(mediaRes.data);

    if (metricsRes.data) {
      processPerformanceData(metricsRes.data, creativesRes.data || [], slotsRes.data || [], mediaRes.data || []);
      processHourlyData(metricsRes.data);
      processDeviceData(metricsRes.data);
      processLocationData(metricsRes.data);
      processCityData(metricsRes.data);
      await processComparison(startDateTime, endDateTime);
    }

    setLoading(false);
  };

  const processMetrics = (data: Metric[]) => {
    const dateMap = new Map<string, { impressions: number; clics: number }>();
    let totalImpressions = 0;
    let totalClics = 0;
    const uniqueIPs = new Set<string>();

    data.forEach(metric => {
      const date = new Date(metric.created_at).toLocaleDateString();

      if (!dateMap.has(date)) {
        dateMap.set(date, { impressions: 0, clics: 0 });
      }

      const entry = dateMap.get(date)!;

      if (metric.type === 'IMPRESSION') {
        entry.impressions++;
        totalImpressions++;
      } else if (metric.type === 'CLICK') {
        entry.clics++;
        totalClics++;
      }

      if (metric.ip) {
        uniqueIPs.add(metric.ip);
      }
    });

    const uniqueCountries = new Set<string>();
    data.forEach(metric => {
      if (metric.country) uniqueCountries.add(metric.country);
    });

    const aggregatedData: AggregatedMetric[] = Array.from(dateMap.entries())
      .map(([date, { impressions, clics }]) => {
        const alcance = impressions + clics * 2;
        return { date, impressions, clics, alcance };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const totalAlcance = aggregatedData.reduce((sum, d) => sum + d.alcance, 0);
    const avgAlcance = aggregatedData.length > 0 ? totalAlcance / aggregatedData.length : 0;

    setAggregated(aggregatedData);
    setSummary({
      totalImpressions,
      totalClics,
      uniqueUsers: uniqueIPs.size,
      avgAlcance,
      totalAlcance,
      uniqueCountries: uniqueCountries.size,
    });
  };

  const processHourlyData = (data: Metric[]) => {
    const hourMap = new Map<number, { impressions: number; clics: number }>();

    for (let i = 0; i < 24; i++) {
      hourMap.set(i, { impressions: 0, clics: 0 });
    }

    data.forEach(metric => {
      const hour = new Date(metric.created_at).getHours();
      const entry = hourMap.get(hour)!;

      if (metric.type === 'IMPRESSION') {
        entry.impressions++;
      } else if (metric.type === 'CLICK') {
        entry.clics++;
      }
    });

    const hourlyData: HourlyMetric[] = Array.from(hourMap.entries())
      .map(([hour, { impressions, clics }]) => ({
        hour: `${hour}:00`,
        impressions,
        clics,
      }))
      .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));

    setHourlyData(hourlyData);
  };

  const processPerformanceData = (
    data: Metric[],
    creativesData: Creative[],
    slotsData: Slot[],
    mediaData: Media[]
  ) => {
    const creativeMap = new Map<string, { impressions: number; clics: number }>();
    const slotMap = new Map<string, { impressions: number; clics: number }>();
    const mediaMap = new Map<string, { impressions: number; clics: number }>();

    data.forEach(metric => {
      if (metric.creative_id) {
        if (!creativeMap.has(metric.creative_id)) {
          creativeMap.set(metric.creative_id, { impressions: 0, clics: 0 });
        }
        const entry = creativeMap.get(metric.creative_id)!;
        if (metric.type === 'IMPRESSION') entry.impressions++;
        else if (metric.type === 'CLICK') entry.clics++;
      }

      if (metric.slot_id) {
        if (!slotMap.has(metric.slot_id)) {
          slotMap.set(metric.slot_id, { impressions: 0, clics: 0 });
        }
        const entry = slotMap.get(metric.slot_id)!;
        if (metric.type === 'IMPRESSION') entry.impressions++;
        else if (metric.type === 'CLICK') entry.clics++;
      }

      if (metric.media_id) {
        if (!mediaMap.has(metric.media_id)) {
          mediaMap.set(metric.media_id, { impressions: 0, clics: 0 });
        }
        const entry = mediaMap.get(metric.media_id)!;
        if (metric.type === 'IMPRESSION') entry.impressions++;
        else if (metric.type === 'CLICK') entry.clics++;
      }
    });

    const topCreativesData: PerformanceData[] = Array.from(creativeMap.entries())
      .map(([id, { impressions, clics }]) => ({
        name: creativesData.find(c => c.id === id)?.name || `Creative ${id.substring(0, 8)}`,
        impressions,
        clics,
      }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 5);

    const topSlotsData: PerformanceData[] = Array.from(slotMap.entries())
      .map(([id, { impressions, clics }]) => ({
        name: slotsData.find(s => s.id === id)?.slug || `Slot ${id.substring(0, 8)}`,
        impressions,
        clics,
      }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 5);

    const topMediaData: PerformanceData[] = Array.from(mediaMap.entries())
      .map(([id, { impressions, clics }]) => ({
        name: mediaData.find(m => m.id === id)?.name || `Media ${id.substring(0, 8)}`,
        impressions,
        clics,
      }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 5);

    setTopCreatives(topCreativesData);
    setTopSlots(topSlotsData);
    setTopMedia(topMediaData);
  };

  const processDeviceData = (data: Metric[]) => {
    const deviceCounts = {
      Mobile: 0,
      Desktop: 0,
      Tablet: 0,
      Unknown: 0,
    };

    data.forEach(metric => {
      const ua = metric.user_agent?.toLowerCase() || '';
      if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
        deviceCounts.Mobile++;
      } else if (ua.includes('tablet') || ua.includes('ipad')) {
        deviceCounts.Tablet++;
      } else if (ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari')) {
        deviceCounts.Desktop++;
      } else {
        deviceCounts.Unknown++;
      }
    });

    const deviceData = [
      { name: 'Mobile', value: deviceCounts.Mobile },
      { name: 'Desktop', value: deviceCounts.Desktop },
      { name: 'Tablet', value: deviceCounts.Tablet },
      { name: 'Unknown', value: deviceCounts.Unknown },
    ].filter(d => d.value > 0);

    setDeviceData(deviceData);
  };

  const processLocationData = (data: Metric[]) => {
    const locationMap = new Map<string, { impressions: number; clics: number }>();

    data.forEach(metric => {
      const location = metric.country || 'Unknown';
      if (!locationMap.has(location)) {
        locationMap.set(location, { impressions: 0, clics: 0 });
      }
      const entry = locationMap.get(location)!;
      if (metric.type === 'IMPRESSION') entry.impressions++;
      else if (metric.type === 'CLICK') entry.clics++;
    });

    const topLocations: LocationData[] = Array.from(locationMap.entries())
      .map(([name, { impressions, clics }]) => ({ name, impressions, clics }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10);

    setLocationData(topLocations);
  };

  const processCityData = (data: Metric[]) => {
    const cityMap = new Map<string, { impressions: number; clics: number }>();

    data.forEach(metric => {
      const city = metric.city || 'Desconocida';
      if (!cityMap.has(city)) {
        cityMap.set(city, { impressions: 0, clics: 0 });
      }
      const entry = cityMap.get(city)!;
      if (metric.type === 'IMPRESSION') entry.impressions++;
      else if (metric.type === 'CLICK') entry.clics++;
    });

    const topCities: CityData[] = Array.from(cityMap.entries())
      .map(([name, { impressions, clics }]) => ({ name, impressions, clics }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10);

    setCityData(topCities);
  };

  const processComparison = async (currentStart: string, currentEnd: string) => {
    const currentDiff = new Date(currentEnd).getTime() - new Date(currentStart).getTime();
    const previousEnd = new Date(currentStart);
    previousEnd.setMilliseconds(-1);
    const previousStart = new Date(previousEnd.getTime() - currentDiff);

    const { data: currentData } = await supabase
      .from('metrics')
      .select('type')
      .gte('created_at', currentStart)
      .lte('created_at', currentEnd);

    const { data: previousData } = await supabase
      .from('metrics')
      .select('type')
      .gte('created_at', previousStart.toISOString())
      .lte('created_at', previousEnd.toISOString());

    const currentImpressions = currentData?.filter(m => m.type === 'IMPRESSION').length || 0;
    const currentClics = currentData?.filter(m => m.type === 'CLICK').length || 0;

    const previousImpressions = previousData?.filter(m => m.type === 'IMPRESSION').length || 0;
    const previousClics = previousData?.filter(m => m.type === 'CLICK').length || 0;

    setComparison({
      current: { impressions: currentImpressions, clics: currentClics },
      previous: { impressions: previousImpressions, clics: previousClics },
    });
  };

  const getChangeIcon = (current: number, previous: number) => {
    if (previous === 0) return <Minus className="w-4 h-4" />;
    const change = ((current - previous) / previous) * 100;
    if (change > 0) return <ArrowUpRight className="w-4 h-4 text-green-600" />;
    if (change < 0) return <ArrowDownRight className="w-4 h-4 text-red-600" />;
    return <Minus className="w-4 h-4 text-slate-400" />;
  };

  const getChangePercent = (current: number, previous: number) => {
    if (previous === 0) return '—';
    const change = ((current - previous) / previous) * 100;
    return `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
  };

  const getChangeColor = (current: number, previous: number) => {
    if (previous === 0) return 'text-slate-600';
    const change = current - previous;
    if (change > 0) return 'text-green-600';
    if (change < 0) return 'text-red-600';
    return 'text-slate-600';
  };

  const handleExportExcel = () => {
    const exportData = metrics.map(metric => {
      const creative = creatives.find(c => c.id === metric.creative_id);
      const slot = slots.find(s => s.id === metric.slot_id);
      const mediaItem = media.find(m => m.id === metric.media_id);

      return {
        Fecha: new Date(metric.created_at).toLocaleString('es-DO'),
        Tipo: metric.type === 'IMPRESSION' ? 'Impresión' : 'Clic',
        Medio: mediaItem?.name || 'N/A',
        Espacio: slot?.slug || 'N/A',
        Campaña: creative?.name || 'N/A',
        IP: metric.ip || 'N/A',
        País: metric.country || 'N/A',
        Ciudad: metric.city || 'N/A',
        Región: metric.region || 'N/A',
        Idioma: metric.language || 'N/A',
        Dispositivo: metric.user_agent || 'N/A',
        Referencia: metric.referrer || 'N/A',
        Sentimiento: metric.sentiment_label || 'N/A',
        Puntuación: metric.sentiment_score?.toString() || 'N/A',
      };
    });

    exportToExcel(exportData, 'metricas_detalladas');
  };

  const handleExportPDF = () => {
    const columns = [
      { header: 'Fecha', dataKey: 'fecha' },
      { header: 'Tipo', dataKey: 'tipo' },
      { header: 'Medio', dataKey: 'medio' },
      { header: 'Campaña', dataKey: 'campana' },
      { header: 'País', dataKey: 'pais' },
      { header: 'Ciudad', dataKey: 'ciudad' },
    ];

    const exportData = metrics.map(metric => {
      const creative = creatives.find(c => c.id === metric.creative_id);
      const mediaItem = media.find(m => m.id === metric.media_id);

      return {
        fecha: new Date(metric.created_at).toLocaleString('es-DO'),
        tipo: metric.type === 'IMPRESSION' ? 'Impresión' : 'Clic',
        medio: mediaItem?.name || 'N/A',
        campana: creative?.name || 'N/A',
        pais: metric.country || 'N/A',
        ciudad: metric.city || 'N/A',
      };
    });

    generatePDFReport('Reporte Detallado de Métricas', columns, exportData, 'metricas_detalladas');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <Activity className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Cargando métricas avanzadas...</p>
        </div>
      </div>
    );
  }

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Métricas Avanzadas</h1>
          <p className="text-slate-600 mt-1">Panel completo de análisis y rendimiento</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleExportExcel}>
            <Download className="w-4 h-4 mr-2" />
            Excel
          </Button>
          <Button variant="secondary" onClick={handleExportPDF}>
            <Download className="w-4 h-4 mr-2" />
            PDF
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-slate-600" />
            <label className="text-sm font-medium text-slate-700">Desde:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">Hasta:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-slate-600" />
            <label className="text-sm font-medium text-slate-700">Medio:</label>
            <select
              value={selectedMediaId}
              onChange={(e) => setSelectedMediaId(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[200px]"
            >
              <option value="all">Todos los medios</option>
              {media.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-5 border border-blue-200">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-blue-700">Impresiones Totales</p>
                <p className="text-3xl font-bold text-blue-900 mt-1">{summary.totalImpressions.toLocaleString()}</p>
                <div className={`flex items-center gap-1 mt-2 text-sm ${getChangeColor(comparison.current.impressions, comparison.previous.impressions)}`}>
                  {getChangeIcon(comparison.current.impressions, comparison.previous.impressions)}
                  <span className="font-medium">{getChangePercent(comparison.current.impressions, comparison.previous.impressions)}</span>
                  <span className="text-xs text-slate-600">vs período anterior</span>
                </div>
              </div>
              <div className="bg-blue-600 rounded-lg p-2.5">
                <Eye className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-5 border border-green-200">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-green-700">Clics Totales</p>
                <p className="text-3xl font-bold text-green-900 mt-1">{summary.totalClics.toLocaleString()}</p>
                <div className={`flex items-center gap-1 mt-2 text-sm ${getChangeColor(comparison.current.clics, comparison.previous.clics)}`}>
                  {getChangeIcon(comparison.current.clics, comparison.previous.clics)}
                  <span className="font-medium">{getChangePercent(comparison.current.clics, comparison.previous.clics)}</span>
                  <span className="text-xs text-slate-600">vs período anterior</span>
                </div>
              </div>
              <div className="bg-green-600 rounded-lg p-2.5">
                <MousePointer className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-5 border border-purple-200">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-purple-700">Países Alcanzados</p>
                <p className="text-3xl font-bold text-purple-900 mt-1">{summary.uniqueCountries}</p>
                <div className="flex items-center gap-1 mt-2 text-sm text-slate-600">
                  <Globe className="w-4 h-4" />
                  <span className="text-xs">Distribución geográfica</span>
                </div>
              </div>
              <div className="bg-purple-600 rounded-lg p-2.5">
                <Globe className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-5 border border-orange-200">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-orange-700">Usuarios Únicos</p>
                <p className="text-3xl font-bold text-orange-900 mt-1">{summary.uniqueUsers.toLocaleString()}</p>
                <div className="flex items-center gap-1 mt-2 text-sm text-slate-600">
                  <Users className="w-4 h-4" />
                  <span className="text-xs">IPs únicas detectadas</span>
                </div>
              </div>
              <div className="bg-orange-600 rounded-lg p-2.5">
                <Users className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              Rendimiento en el Tiempo
            </h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={aggregated}>
              <defs>
                <linearGradient id="colorImpressions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorClics" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Legend />
              <Area type="monotone" dataKey="impressions" stroke="#3b82f6" fillOpacity={1} fill="url(#colorImpressions)" strokeWidth={2} />
              <Area type="monotone" dataKey="clics" stroke="#10b981" fillOpacity={1} fill="url(#colorClics)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-purple-600" />
              Análisis Horario
            </h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="hour" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Legend />
              <Bar dataKey="impressions" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="clics" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Award className="w-5 h-5 text-yellow-600" />
              Top Campañas
            </h2>
          </div>
          <div className="space-y-3">
            {topCreatives.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No hay datos disponibles</p>
            ) : (
              topCreatives.map((creative, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{creative.name}</p>
                      <p className="text-xs text-slate-500">{creative.impressions.toLocaleString()} imp. · {creative.clics} clics</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-600">{creative.clics}</p>
                    <p className="text-xs text-slate-500">Clics</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Target className="w-5 h-5 text-green-600" />
              Top de Asignaciones
            </h2>
          </div>
          <div className="space-y-3">
            {topSlots.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No hay datos disponibles</p>
            ) : (
              topSlots.map((slot, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-700 font-bold text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{slot.name}</p>
                      <p className="text-xs text-slate-500">{slot.impressions.toLocaleString()} imp. · {slot.clics} clics</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-600">{slot.clics}</p>
                    <p className="text-xs text-slate-500">Clics</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Globe className="w-5 h-5 text-orange-600" />
              Top Medios
            </h2>
          </div>
          <div className="space-y-3">
            {topMedia.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No hay datos disponibles</p>
            ) : (
              topMedia.map((mediaItem, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 text-orange-700 font-bold text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{mediaItem.name}</p>
                      <p className="text-xs text-slate-500">{mediaItem.impressions.toLocaleString()} imp. · {mediaItem.clics} clics</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-600">{mediaItem.clics}</p>
                    <p className="text-xs text-slate-500">Clics</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-indigo-600" />
              Distribución por Dispositivo
            </h2>
          </div>
          <div className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={deviceData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {deviceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-600" />
              Nivel de Alcance
            </h2>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={aggregated}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Bar dataKey="alcance" fill="#f59e0b" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-slate-500 mt-3 text-center">
            Score calculado: Impresiones + (Clics × 2)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Globe className="w-5 h-5 text-blue-600" />
              Top Países
            </h2>
          </div>
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {locationData.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No hay datos disponibles</p>
            ) : (
              locationData.map((location, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-xs">
                      {index + 1}
                    </div>
                    <span className="font-medium text-slate-900 text-sm">{location.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-600">{location.impressions} imp.</p>
                    <p className="text-xs text-green-600 font-medium">{location.clics} clics</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Globe className="w-5 h-5 text-purple-600" />
              Top Ciudades
            </h2>
          </div>
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {cityData.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No hay datos disponibles</p>
            ) : (
              cityData.map((city, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-700 font-bold text-xs">
                      {index + 1}
                    </div>
                    <span className="font-medium text-slate-900 text-sm">{city.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-600">{city.impressions} imp.</p>
                    <p className="text-xs text-green-600 font-medium">{city.clics} clics</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="bg-blue-600 rounded-lg p-3">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Panel Avanzado de Métricas</h3>
            <p className="text-sm text-slate-700 mb-3">
              Este panel muestra análisis en tiempo real de todas tus campañas publicitarias, incluyendo rendimiento por creative, slot y medio, análisis horario, distribución por dispositivo y comparación con períodos anteriores.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <p className="font-medium text-slate-900">Alcance Promedio</p>
                <p className="text-xl font-bold text-blue-600 mt-1">{summary.avgAlcance.toFixed(0)}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <p className="font-medium text-slate-900">Total Alcance</p>
                <p className="text-xl font-bold text-indigo-600 mt-1">{summary.totalAlcance.toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <p className="font-medium text-slate-900">Usuarios/Clic</p>
                <p className="text-xl font-bold text-purple-600 mt-1">{summary.uniqueUsers > 0 ? (summary.uniqueUsers / (summary.totalClics || 1)).toFixed(1) : '0'}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-100">
                <p className="font-medium text-slate-900">Días Activos</p>
                <p className="text-xl font-bold text-green-600 mt-1">{aggregated.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
