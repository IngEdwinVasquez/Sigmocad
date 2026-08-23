import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { MonitorPlay, Grid3x3, Image, Link2, TrendingUp, Activity, ArrowUpRight, Zap } from 'lucide-react';

interface Stats {
  mediaCount: number;
  slotsCount: number;
  creativesCount: number;
  assignmentsCount: number;
  impressionsToday: number;
  clicsToday: number;
}

interface DashboardProps {
  onNavigate?: (page: string) => void;
}

export function Dashboard({ onNavigate }: DashboardProps = {}) {
  const [stats, setStats] = useState<Stats>({
    mediaCount: 0,
    slotsCount: 0,
    creativesCount: 0,
    assignmentsCount: 0,
    impressionsToday: 0,
    clicsToday: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    const [mediaRes, slotsRes, creativesRes, assignmentsRes, impressionsRes, clicsRes] = await Promise.all([
      supabase.from('media').select('id', { count: 'exact', head: true }),
      supabase.from('slots').select('id', { count: 'exact', head: true }),
      supabase.from('creatives').select('id', { count: 'exact', head: true }),
      supabase.from('assignments').select('id', { count: 'exact', head: true }),
      supabase.from('metrics').select('id', { count: 'exact', head: true }).eq('type', 'IMPRESSION').gte('created_at', todayStr),
      supabase.from('metrics').select('id', { count: 'exact', head: true }).eq('type', 'CLICK').gte('created_at', todayStr),
    ]);

    setStats({
      mediaCount: mediaRes.count || 0,
      slotsCount: slotsRes.count || 0,
      creativesCount: creativesRes.count || 0,
      assignmentsCount: assignmentsRes.count || 0,
      impressionsToday: impressionsRes.count || 0,
      clicsToday: clicsRes.count || 0,
    });

    setLoading(false);
  };

  const handleCardClick = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-slate-200 border-t-slate-900 mb-4"></div>
          <p className="text-slate-600 font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  const ctr = stats.impressionsToday > 0 ? (stats.clicsToday / stats.impressionsToday) * 100 : 0;

  const statCards = [
    { id: 'media', name: 'Medios', value: stats.mediaCount, icon: MonitorPlay, color: 'from-blue-500 to-blue-600', bgColor: 'bg-blue-50', textColor: 'text-blue-600' },
    { id: 'slots', name: 'Espacios', value: stats.slotsCount, icon: Grid3x3, color: 'from-emerald-500 to-emerald-600', bgColor: 'bg-emerald-50', textColor: 'text-emerald-600' },
    { id: 'creatives', name: 'Campaña', value: stats.creativesCount, icon: Image, color: 'from-violet-500 to-violet-600', bgColor: 'bg-violet-50', textColor: 'text-violet-600' },
    { id: 'assignments', name: 'Asignaciones', value: stats.assignmentsCount, icon: Link2, color: 'from-orange-500 to-orange-600', bgColor: 'bg-orange-50', textColor: 'text-orange-600' },
    { id: 'metrics', name: 'Impresiones Hoy', value: stats.impressionsToday, icon: Activity, color: 'from-cyan-500 to-cyan-600', bgColor: 'bg-cyan-50', textColor: 'text-cyan-600' },
    { id: 'metrics', name: 'CTR Hoy', value: `${ctr.toFixed(2)}%`, icon: TrendingUp, color: 'from-pink-500 to-pink-600', bgColor: 'bg-pink-50', textColor: 'text-pink-600' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Bienvenido a SIGMOCAD</h1>
          <p className="text-slate-600 mt-1">Tu plataforma integral de gestión publicitaria</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-lg border border-emerald-200">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
          <span className="text-sm font-medium text-emerald-700">Sistema Operacional</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.id + card.name}
              onClick={() => handleCardClick(card.id)}
              className="group relative bg-white rounded-2xl p-6 shadow-sm border-2 border-slate-100 hover:border-slate-200 hover:shadow-lg transition-all duration-300 text-left"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-xl ${card.bgColor}`}>
                  <Icon className={`w-6 h-6 ${card.textColor}`} />
                </div>
                <ArrowUpRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600 mb-1">{card.name}</p>
                <p className="text-3xl font-bold text-slate-900">{typeof card.value === 'number' ? card.value.toLocaleString() : card.value}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-8 text-white shadow-xl">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Resumen del Día</h2>
              <p className="text-slate-300">Métricas de rendimiento en tiempo real</p>
            </div>
            <Zap className="w-8 h-8 text-yellow-400" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <p className="text-slate-300 text-sm mb-1">Clics</p>
              <p className="text-3xl font-bold">{stats.clicsToday.toLocaleString()}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <p className="text-slate-300 text-sm mb-1">Asignaciones</p>
              <p className="text-3xl font-bold">{stats.assignmentsCount}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <p className="text-slate-300 text-sm mb-1">Recursos</p>
              <p className="text-3xl font-bold">{stats.mediaCount + stats.slotsCount + stats.creativesCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border-2 border-slate-100">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Acciones Rápidas</h3>
          <div className="space-y-3">
            {[
              { label: 'Agregar Nuevo Medio', page: 'media' },
              { label: 'Subir Campaña', page: 'creatives' },
              { label: 'Crear Asignación', page: 'assignments' },
            ].map((action) => (
              <button
                key={action.page}
                onClick={() => handleCardClick(action.page)}
                className="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-xl transition-all duration-200 group border border-slate-200 hover:border-slate-300"
              >
                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">{action.label}</span>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 inline-block ml-2 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border-2 border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <MonitorPlay className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Medios Activos</p>
              <p className="text-xl font-bold text-slate-900">{stats.mediaCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border-2 border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Estado de Entrega</p>
              <p className="text-xl font-bold text-emerald-600">Activo</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border-2 border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center">
              <Activity className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Salud del Sistema</p>
              <p className="text-xl font-bold text-violet-600">Óptimo</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
