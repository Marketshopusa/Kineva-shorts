"use client"

import { useState, useEffect, useRef } from "react"
import Breadcrumb from "@/components/ui/Breadcrumb"
import { Image, Upload, Trash2, Save, Check, Eye, Sliders, Music, Play, Square, Loader2 } from "lucide-react"

export default function SettingsPage() {
  const [logoUrl, setLogoUrl] = useState(null)
  const [preview, setPreview] = useState(null)
  const [watermarkEnabled, setWatermarkEnabled] = useState(true)
  const [watermarkText, setWatermarkText] = useState("KINEVA")
  const [watermarkSize, setWatermarkSize] = useState(48)
  const [watermarkColor, setWatermarkColor] = useState("#FFFFFF")
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.4)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const fileRef = useRef(null)

  // Generation settings
  const [llmProvider, setLlmProvider] = useState("anthropic")
  const [defaultImageProvider, setDefaultImageProvider] = useState("gemini")
  const [geminiImageModel, setGeminiImageModel] = useState("")
  const [leonardoModelId, setLeonardoModelId] = useState("")

  // Voice / TTS (default: free neural edge-tts)
  const [ttsEngine, setTtsEngine] = useState("edge")
  const [ttsVoices, setTtsVoices] = useState({})
  const [ttsReady, setTtsReady] = useState(true)
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState("")
  const [elevenLabsConfigured, setElevenLabsConfigured] = useState(false)

  // Provider availability
  const [configuredProviders, setConfiguredProviders] = useState({})

  // Music catalog state
  const [tracks, setTracks] = useState([])
  const [musicUploading, setMusicUploading] = useState(false)
  const [musicPreviewId, setMusicPreviewId] = useState(null)
  const [newTrackName, setNewTrackName] = useState("")
  const [newTrackMood, setNewTrackMood] = useState("")
  const [newTrackGenre, setNewTrackGenre] = useState("")
  const [newTrackBpm, setNewTrackBpm] = useState("")
  const [newTrackTags, setNewTrackTags] = useState("")
  const [newTrackDescription, setNewTrackDescription] = useState("")
  const musicFileRef = useRef(null)
  const musicPreviewRef = useRef(null)

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        setLogoUrl(data.logoUrl || null)
        setWatermarkEnabled(data.watermarkEnabled ?? true)
        setWatermarkText(data.watermarkText || "KINEVA")
        setWatermarkSize(data.watermarkSize ?? 48)
        setWatermarkColor(data.watermarkColor ?? "#FFFFFF")
        setWatermarkOpacity(data.watermarkOpacity ?? 0.4)
        setLlmProvider(data.llmProvider || "anthropic")
        setDefaultImageProvider(data.defaultImageProvider || "gemini")
        setGeminiImageModel(data.geminiImageModel || "")
        setLeonardoModelId(data.leonardoModelId || "")
        setTtsEngine(data.ttsEngine || "edge")
        setTtsVoices(data.ttsVoices || {})
        setTtsReady(data.ttsReady !== false)
        setElevenLabsVoiceId(data.elevenLabsVoiceId || "")
        setElevenLabsConfigured(data.elevenLabsConfigured || false)
        setConfiguredProviders(data.configuredProviders || {})
        setLoading(false)
      })
    fetchTracks()
  }, [])

  async function fetchTracks() {
    try {
      const res = await fetch("/api/admin/audio-tracks")
      const data = await res.json()
      setTracks(data.tracks || [])
    } catch {}
  }

  async function handleMusicUpload() {
    const file = musicFileRef.current?.files?.[0]
    if (!file || !newTrackName.trim()) return
    setMusicUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("name", newTrackName.trim())
      form.append("mood", newTrackMood)
      form.append("genre", newTrackGenre)
      form.append("bpm", newTrackBpm)
      form.append("tags", newTrackTags)
      form.append("description", newTrackDescription)
      const res = await fetch("/api/admin/audio-tracks", { method: "POST", body: form })
      if (res.ok) {
        await fetchTracks()
        setNewTrackName("")
        setNewTrackMood("")
        setNewTrackGenre("")
        setNewTrackBpm("")
        setNewTrackTags("")
        setNewTrackDescription("")
        if (musicFileRef.current) musicFileRef.current.value = ""
      }
    } finally {
      setMusicUploading(false)
    }
  }

  async function handleDeleteTrack(id) {
    try {
      await fetch("/api/admin/audio-tracks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      await fetchTracks()
    } catch {}
  }

  async function handleRemoveBuiltInTrack(id) {
    try {
      await fetch("/api/admin/audio-tracks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, hidden: true }),
      })
      await fetchTracks()
    } catch {}
  }

  function handlePreviewToggle(track) {
    if (musicPreviewRef.current) {
      musicPreviewRef.current.pause()
      musicPreviewRef.current = null
    }
    if (musicPreviewId === track.id) {
      setMusicPreviewId(null)
      return
    }
    const audio = new Audio(track.file)
    audio.volume = 0.3
    audio.play().catch(() => {})
    audio.onended = () => setMusicPreviewId(null)
    musicPreviewRef.current = audio
    setMusicPreviewId(track.id)
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPreview(reader.result)
    reader.readAsDataURL(file)
  }

  function handleUrlInput(e) {
    const url = e.target.value
    setPreview(url || null)
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    const newLogoUrl = preview || logoUrl

    const body = {
      logoUrl: newLogoUrl,
      watermarkEnabled,
      watermarkText,
      watermarkSize,
      watermarkColor,
      watermarkOpacity,
      llmProvider,
      defaultImageProvider,
      geminiImageModel: geminiImageModel || null,
      leonardoModelId: leonardoModelId || null,
      elevenLabsVoiceId: elevenLabsVoiceId || null,
    }

    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      const data = await res.json()
      setLogoUrl(data.logoUrl)
      setPreview(null)
      setLlmProvider(data.llmProvider || "anthropic")
      setDefaultImageProvider(data.defaultImageProvider || "gemini")
      setGeminiImageModel(data.geminiImageModel || "")
      setLeonardoModelId(data.leonardoModelId || "")
      setTtsEngine(data.ttsEngine || "edge")
      setTtsVoices(data.ttsVoices || {})
      setTtsReady(data.ttsReady !== false)
      setElevenLabsVoiceId(data.elevenLabsVoiceId || "")
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  function handleRemoveLogo() {
    setPreview(null)
    setLogoUrl(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  const currentLogo = preview || logoUrl

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 animate-fade-in">
      <Breadcrumb items={[
        { label: "Dashboard", href: "/admin" },
        { label: "Settings" },
      ]} />

      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {loading ? (
        <div className="h-48 bg-surface-2 rounded-xl animate-pulse" />
      ) : (
        <div className="space-y-6">
          {/* Logo Section */}
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
                <Image className="w-4 h-4 text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Logo</h2>
                <p className="text-xs text-text-muted">Displayed in the navbar</p>
              </div>
            </div>

            {currentLogo && (
              <div className="mb-4 p-4 bg-input-bg rounded-xl inline-flex items-center gap-4">
                <div className="bg-background rounded-lg p-3 flex items-center justify-center" style={{ minWidth: 60, minHeight: 60 }}>
                  <img src={currentLogo} alt="Logo preview" className="max-h-12 max-w-48 object-contain" />
                </div>
                <button
                  onClick={handleRemoveLogo}
                  className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent transition-colors btn-press"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1.5">Upload file</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-3 p-3 bg-input-bg border border-dashed border-card-border rounded-xl cursor-pointer hover:border-accent/30 transition-colors"
                >
                  <Upload className="w-4 h-4 text-text-muted" />
                  <span className="text-sm text-text-muted">Click to upload image...</span>
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              </div>

              <div>
                <label className="text-xs font-medium text-text-secondary block mb-1.5">Or paste image URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/logo.png"
                  onChange={handleUrlInput}
                  className="w-full px-3 py-2.5 bg-input-bg border border-card-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Watermark Section */}
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
                <Eye className="w-4 h-4 text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Public Watermark</h2>
                <p className="text-xs text-text-muted">Show watermark on public videos</p>
              </div>
            </div>

            <div className="space-y-4">
              <label className="flex items-center justify-between p-3 bg-input-bg rounded-xl cursor-pointer select-none">
                <div>
                  <p className="text-sm font-medium">Enable watermark</p>
                  <p className="text-xs text-text-muted mt-0.5">Displays text in the upper-right corner of public videos</p>
                </div>
                <div
                  onClick={() => setWatermarkEnabled((v) => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ml-4 ${watermarkEnabled ? "bg-accent" : "bg-card-border"}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${watermarkEnabled ? "translate-x-5" : ""}`} />
                </div>
              </label>

              {watermarkEnabled && (
                <>
                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-1.5">Watermark Text</label>
                    <input
                      type="text"
                      value={watermarkText}
                      onChange={(e) => setWatermarkText(e.target.value)}
                      placeholder="KINEVA"
                      className="w-full px-3 py-2.5 bg-input-bg border border-card-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
                    />
                  </div>

                  <div className="relative w-full aspect-video bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl overflow-hidden border border-card-border">
                    <span
                      style={{
                        position: "absolute",
                        top: 12,
                        right: 16,
                        color: watermarkColor,
                        opacity: watermarkOpacity,
                        fontSize: watermarkSize * 0.45,
                        fontWeight: 700,
                        letterSpacing: 2,
                        fontFamily: "system-ui, -apple-system, sans-serif",
                        textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                        userSelect: "none",
                      }}
                    >
                      {watermarkText}
                    </span>
                    <div className="absolute bottom-3 left-4 text-[10px] text-text-muted">Preview</div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-1.5">Size — {watermarkSize}px</label>
                    <input type="range" min="16" max="120" value={watermarkSize} onChange={(e) => setWatermarkSize(parseInt(e.target.value))} className="w-full accent-accent" />
                    <div className="flex justify-between text-[10px] text-text-muted mt-0.5"><span>16px</span><span>120px</span></div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-1.5">Color</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={watermarkColor} onChange={(e) => setWatermarkColor(e.target.value)} className="w-10 h-10 rounded-lg border border-card-border cursor-pointer bg-transparent" />
                      <input
                        type="text"
                        value={watermarkColor}
                        onChange={(e) => { const v = e.target.value; if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setWatermarkColor(v) }}
                        maxLength={7}
                        className="w-28 px-3 py-2 bg-input-bg border border-card-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
                      />
                      <div className="flex gap-1.5">
                        {["#FFFFFF", "#000000", "#FF0000", "#FFD700"].map((c) => (
                          <button key={c} onClick={() => setWatermarkColor(c)} className={`w-7 h-7 rounded-full border-2 transition-all ${watermarkColor === c ? "border-accent scale-110" : "border-card-border"}`} style={{ backgroundColor: c }} title={c} />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-1.5">Opacity — {Math.round(watermarkOpacity * 100)}%</label>
                    <input type="range" min="10" max="100" value={Math.round(watermarkOpacity * 100)} onChange={(e) => setWatermarkOpacity(parseInt(e.target.value) / 100)} className="w-full accent-accent" />
                    <div className="flex justify-between text-[10px] text-text-muted mt-0.5"><span>10%</span><span>100%</span></div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* API Keys Status */}
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold">API Keys</h2>
                <p className="text-xs text-text-muted">Configure in <code className="bg-surface-2 px-1.5 py-0.5 rounded font-mono text-[10px]">.env.local</code> — never stored in the database</p>
              </div>
            </div>

            <div className="space-y-2">
              {[
                { label: "ANTHROPIC_API_KEY", name: "Anthropic (Claude)", key: "anthropic", hint: "Screenplay, scoring, summaries" },
                { label: "GOOGLE_API_KEY", name: "Google (Gemini)", key: "google", hint: "Text + image generation" },
                { label: "OPENAI_API_KEY", name: "OpenAI (GPT-4o)", key: "openai", hint: "Text + image generation" },
                { label: "QWEN_API_KEY", name: "Qwen", key: "qwen", hint: "Text + image generation" },
                { label: "LEONARDO_API_KEY", name: "Leonardo AI", key: "leonardo", hint: "Image generation (Phoenix, Nano, GPT2)" },
                { label: "ELEVENLABS_API_KEY", name: "ElevenLabs (optional later)", key: "elevenlabs", hint: "Not used unless TTS_ENGINE=elevenlabs" },
              ].map((item) => {
                const configured = item.key === "elevenlabs" ? elevenLabsConfigured : configuredProviders[item.key]
                return (
                  <div key={item.key} className="flex items-center justify-between p-3 bg-input-bg rounded-xl">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">{item.name}</span>
                        <code className="text-[10px] bg-surface-2 px-1.5 py-0.5 rounded font-mono text-text-muted">{item.label}</code>
                      </div>
                      <p className="text-[10px] text-text-muted mt-0.5">{item.hint}</p>
                    </div>
                    <div className={`flex items-center gap-1.5 text-xs font-medium shrink-0 ${configured ? "text-green-400" : "text-text-muted"}`}>
                      {configured ? (
                        <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Configured</>
                      ) : (
                        <span className="text-yellow-400/70">Not set</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Generation Settings */}
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
                <Sliders className="w-4 h-4 text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Generation Settings</h2>
                <p className="text-xs text-text-muted">AI provider and model preferences</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">LLM Provider <span className="text-text-muted font-normal">(text generation)</span></label>
                {(() => {
                  const llmOptions = [
                    { value: "anthropic", label: "Anthropic — Claude Haiku", key: "anthropic" },
                    { value: "google",    label: "Google — Gemini Flash",    key: "google" },
                    { value: "openai",    label: "OpenAI — GPT-4o mini",     key: "openai" },
                    { value: "qwen",      label: "Qwen — Plus",             key: "qwen" },
                  ]
                  return (
                    <div className="grid grid-cols-2 gap-2">
                      {llmOptions.map((opt) => {
                        const configured = configuredProviders[opt.key]
                        const selected = llmProvider === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setLlmProvider(opt.value)}
                            className={`relative text-left p-3 rounded-xl border transition-all ${
                              selected
                                ? "border-accent bg-accent/10"
                                : configured
                                ? "border-card-border bg-input-bg hover:border-accent/40"
                                : "border-card-border bg-input-bg opacity-50"
                            }`}
                          >
                            <div className="text-sm font-medium text-text-primary">{opt.label}</div>
                            <div className={`text-[10px] mt-1 ${configured ? "text-green-400" : "text-yellow-400"}`}>
                              {configured ? "API key configured" : "No API key"}
                            </div>
                            {selected && (
                              <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-accent" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )
                })()}
                <p className="text-[10px] text-text-muted">Applies to screenplay, scoring, image prompts, and summaries</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">Default Image Provider</label>
                {(() => {
                  const imgOptions = [
                    { value: "gemini",        label: "Gemini",     key: "google" },
                    { value: "qwen",          label: "Qwen",       key: "qwen" },
                    { value: "openai",        label: "GPT Image",  key: "openai" },
                    { value: "leonardo",      label: "Leonardo",   key: "leonardo" },
                    { value: "leonardo-nano", label: "Leo Nano",   key: "leonardo" },
                    { value: "leonardo-gpt2", label: "Leo GPT2",   key: "leonardo" },
                  ]
                  return (
                    <div className="grid grid-cols-3 gap-2">
                      {imgOptions.map((opt) => {
                        const configured = configuredProviders[opt.key]
                        const selected = defaultImageProvider === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setDefaultImageProvider(opt.value)}
                            className={`relative text-left p-2.5 rounded-xl border transition-all ${
                              selected
                                ? "border-accent bg-accent/10"
                                : configured
                                ? "border-card-border bg-input-bg hover:border-accent/40"
                                : "border-card-border bg-input-bg opacity-50"
                            }`}
                          >
                            <div className="text-sm font-medium text-text-primary">{opt.label}</div>
                            <div className={`text-[10px] mt-0.5 ${configured ? "text-green-400" : "text-yellow-400"}`}>
                              {configured ? "Ready" : "No key"}
                            </div>
                            {selected && (
                              <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-accent" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )
                })()}
                <p className="text-[10px] text-text-muted">Pre-selected provider when opening the Visuals step</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">Gemini Image Model <span className="text-text-muted font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={geminiImageModel}
                  onChange={(e) => setGeminiImageModel(e.target.value)}
                  placeholder="gemini-2.5-flash-lite"
                  className="w-full px-3 py-2 bg-input-bg border border-card-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all font-mono"
                />
                <p className="text-[10px] text-text-muted">Override the Gemini model used for image generation</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">Leonardo Model ID <span className="text-text-muted font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={leonardoModelId}
                  onChange={(e) => setLeonardoModelId(e.target.value)}
                  placeholder="Leave empty to use Leonardo default model"
                  className="w-full px-3 py-2 bg-input-bg border border-card-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all font-mono"
                />
                <p className="text-[10px] text-text-muted">Find your model ID in the Leonardo AI dashboard</p>
              </div>
            </div>
          </div>

          {/* Narrator voice — generic neural default */}
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold">Narrator voice</h2>
                <p className="text-sm text-text-muted">Default is generic neural TTS ($0). ElevenLabs is an optional later switch.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-text-muted">Engine:</span>
                <span className="font-medium text-text-primary font-mono text-xs">{ttsEngine}</span>
                {ttsReady ? (
                  <span className="text-green-400 text-xs">Ready</span>
                ) : (
                  <span className="text-yellow-400 text-xs">Not ready</span>
                )}
              </div>
              {ttsEngine === "edge" ? (
                <p className="text-xs text-text-muted">
                  Microsoft Edge neural voices via <code className="bg-surface-2 px-1 rounded text-[10px] font-mono">edge-tts</code>.
                  No API key. Install once: <code className="bg-surface-2 px-1 rounded text-[10px] font-mono">pip3 install -r requirements-tts.txt</code>.
                  Override a language with <code className="bg-surface-2 px-1 rounded text-[10px] font-mono">TTS_VOICE_ES</code> in <code className="bg-surface-2 px-1 rounded text-[10px] font-mono">.env</code>.
                </p>
              ) : (
                <p className="text-xs text-yellow-400">Paid ElevenLabs path is active because <code className="bg-surface-2 px-1 rounded text-[10px] font-mono">TTS_ENGINE=elevenlabs</code>.</p>
              )}

              <div>
                <label className="block text-sm font-medium mb-1.5">Default neural voices</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(ttsVoices).map(([lang, voice]) => (
                    <div key={lang} className="flex items-center justify-between p-2.5 bg-input-bg rounded-xl">
                      <span className="text-xs font-mono uppercase text-text-muted">{lang}</span>
                      <span className="text-xs font-mono text-text-primary">{voice}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-card-border pt-4 space-y-3">
                <p className="text-xs font-medium text-text-secondary">Optional later: ElevenLabs</p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-text-muted">API Key:</span>
                  {elevenLabsConfigured ? (
                    <span className="text-green-400 text-xs">Present in env (unused unless TTS_ENGINE=elevenlabs)</span>
                  ) : (
                    <span className="text-text-muted text-xs">Not set — leave empty until later tests pass</span>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">ElevenLabs Voice ID (optional)</label>
                  <input
                    type="text"
                    value={elevenLabsVoiceId}
                    onChange={(e) => setElevenLabsVoiceId(e.target.value)}
                    placeholder="Only used when TTS_ENGINE=elevenlabs"
                    className="w-full px-3 py-2 bg-input-bg border border-card-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Music Catalog */}
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                <Music className="w-4 h-4 text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Music Catalog</h2>
                <p className="text-xs text-text-muted">Upload custom tracks and manage built-in music</p>
              </div>
            </div>

            <div className="space-y-2 mb-5">
              {tracks.filter((t) => !t.hidden).map((track) => (
                <div
                  key={track.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                    track.available ? "bg-input-bg border-card-border" : "bg-surface-2 border-card-border opacity-50"
                  }`}
                >
                  <button
                    onClick={() => track.available && handlePreviewToggle(track)}
                    disabled={!track.available}
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                      musicPreviewId === track.id
                        ? "bg-accent text-white"
                        : track.available
                        ? "bg-surface border border-card-border text-text-muted hover:text-accent hover:border-accent/30"
                        : "bg-surface border border-card-border text-text-muted cursor-not-allowed"
                    }`}
                  >
                    {musicPreviewId === track.id ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-text-primary">{track.name}</span>
                      {track.custom && <span className="text-[10px] px-1.5 py-0.5 bg-accent/10 text-accent rounded-full">Custom</span>}
                      {!track.available && <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded-full">No file</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {track.genre && <span className="text-[10px] text-text-muted">{track.genre}</span>}
                      {track.bpm && <span className="text-[10px] text-text-muted">{track.bpm} BPM</span>}
                      {track.mood && <span className="text-[10px] text-text-muted">{track.mood}</span>}
                    </div>
                  </div>

                  <button
                    onClick={() => track.custom ? handleDeleteTrack(track.id) : handleRemoveBuiltInTrack(track.id)}
                    className="shrink-0 text-text-muted hover:text-red-400 transition-colors"
                    title="Remove track"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t border-card-border pt-5">
              <h3 className="text-sm font-medium text-text-secondary mb-3">Upload Custom Track</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-text-muted block mb-1">Track name *</label>
                    <input type="text" value={newTrackName} onChange={(e) => setNewTrackName(e.target.value)} placeholder="e.g. Romantic Ballad" className="w-full px-3 py-2 bg-input-bg border border-card-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted block mb-1">Genre</label>
                    <input type="text" value={newTrackGenre} onChange={(e) => setNewTrackGenre(e.target.value)} placeholder="e.g. Orchestral, Jazz" className="w-full px-3 py-2 bg-input-bg border border-card-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-text-muted block mb-1">Mood</label>
                    <input type="text" value={newTrackMood} onChange={(e) => setNewTrackMood(e.target.value)} placeholder="e.g. Romantic, suspense" className="w-full px-3 py-2 bg-input-bg border border-card-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted block mb-1">BPM</label>
                    <input type="number" value={newTrackBpm} onChange={(e) => setNewTrackBpm(e.target.value)} placeholder="e.g. 120" min="40" max="220" className="w-full px-3 py-2 bg-input-bg border border-card-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-text-muted block mb-1">Tags <span className="font-normal">(comma-separated)</span></label>
                  <input type="text" value={newTrackTags} onChange={(e) => setNewTrackTags(e.target.value)} placeholder="e.g. romantic, strings, emotional" className="w-full px-3 py-2 bg-input-bg border border-card-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all" />
                </div>
                <div>
                  <label className="text-xs text-text-muted block mb-1">Description</label>
                  <input type="text" value={newTrackDescription} onChange={(e) => setNewTrackDescription(e.target.value)} placeholder="Brief description for editors" className="w-full px-3 py-2 bg-input-bg border border-card-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all" />
                </div>
                <div>
                  <label className="text-xs text-text-muted block mb-1">MP3 file *</label>
                  <div onClick={() => musicFileRef.current?.click()} className="flex items-center gap-3 p-3 bg-input-bg border border-dashed border-card-border rounded-xl cursor-pointer hover:border-accent/30 transition-colors">
                    <Upload className="w-4 h-4 text-text-muted" />
                    <span className="text-sm text-text-muted">{musicFileRef.current?.files?.[0]?.name || "Click to choose MP3..."}</span>
                  </div>
                  <input ref={musicFileRef} type="file" accept="audio/mp3,audio/mpeg,.mp3" onChange={() => setNewTrackName((prev) => prev || musicFileRef.current?.files?.[0]?.name?.replace(/\.mp3$/i, "") || "")} className="hidden" />
                </div>
                <button onClick={handleMusicUpload} disabled={musicUploading || !newTrackName.trim()} className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                  {musicUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {musicUploading ? "Uploading..." : "Upload Track"}
                </button>
              </div>
            </div>
          </div>

          {/* Save */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors btn-press"
            >
              {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
            </button>
          </div>
          <p className="text-[10px] text-text-muted pt-4">
            Kineva. Atribución legal: código base Scenarix, MIT © 2025 Yakup Bülbül. Conservar LICENSE.
          </p>
        </div>
      )}
    </div>
  )
}
