"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { loadAllSeries, deleteSeries } from "@/lib/storage-api"
import SeriesCard from "@/components/series/SeriesCard"
import { Plus, Layers } from "lucide-react"
import Logo from "@/components/Logo"

export default function Dashboard() {
  const [seriesList, setSeriesList] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAllSeries()
      .then((data) => {
        setSeriesList(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => {
        setSeriesList([])
        setLoading(false)
      })
  }, [])

  async function handleDelete(id) {
    await deleteSeries(id)
    setSeriesList((prev) => prev.filter((s) => s.id !== id))
  }

  const totalEpisodes = seriesList.reduce((sum, s) => sum + (s.episodeCount || 0), 0)

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        {[
          { label: "Series", value: seriesList.length, icon: () => <Logo size={16} />, color: "text-accent", isLogo: true },
          { label: "Episodes", value: totalEpisodes, icon: Layers, color: "text-blue-400" },
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="glass rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                {stat.isLogo ? <Icon /> : <Icon className={`w-4 h-4 ${stat.color}`} />}
                <span className="text-xs text-text-muted font-medium uppercase tracking-wide">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold">{loading ? "-" : stat.value}</p>
            </div>
          )
        })}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Kineva</h1>
          <p className="text-text-muted text-sm mt-0.5">Series dramáticas cortas — producción con IA</p>
        </div>
        <Link
          href="/admin/series/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors btn-press"
        >
          <Plus className="w-4 h-4" />
          New Series
        </Link>
      </div>

      {/* Series Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-surface-2 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : seriesList.length === 0 ? (
        <div className="text-center py-24">
          <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-4">
            <Logo size={32} />
          </div>
          <h2 className="text-xl font-semibold mb-2">No series yet</h2>
          <p className="text-text-muted mb-6 text-sm">Create your first AI drama series to get started.</p>
          <Link
            href="/admin/series/new"
            className="inline-flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors btn-press"
          >
            <Plus className="w-4 h-4" />
            Create Your First Series
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {seriesList.map((series) => (
            <SeriesCard key={series.id} series={series} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
