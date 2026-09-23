import { blockedConfig } from "../../content-rails.js"
import { inspectClipEngineReadiness, videoWorkerConfig } from "../../video-engine.js"
import { defaultGenerationSize } from "./minimax-h3.js"

export const JOB_QUEUED = "QUEUED"
export const JOB_RUNNING = "RUNNING"
export const JOB_COMPLETED = "COMPLETED"
export const JOB_FAILED = "FAILED"

export const MAX_TECHNICAL_RETRIES = 1
export const MAX_AESTHETIC_RETRIES_DEFAULT = 0

export function emptyJobMetrics() {
  return {
    gpu_seconds: null,
    generation_seconds: null,
    queue_seconds: null,
    clip_duration: null,
    resolution: defaultGenerationSize(),
    model: "minimax_h3",
    retry_count: 0,
    gpu_hour_rate: null,
    estimatedComputeCost: null,
  }
}

export function estimateComputeCost({ gpuSeconds, gpuHourRate }) {
  if (gpuSeconds == null || gpuHourRate == null) return null
  return Math.round((Number(gpuSeconds) / 3600) * Number(gpuHourRate) * 10000) / 10000
}

export function createVideoJob({
  episodeId,
  seriesId,
  shotId,
  prompt,
  firstFrame,
  lastFrame = null,
  width,
  height,
  duration,
  seed = null,
  characterIds = [],
  continuity = {},
  chainLastFrame = false,
} = {}) {
  const size = defaultGenerationSize()
  return {
    jobId: `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    episodeId,
    seriesId,
    shotId,
    status: JOB_QUEUED,
    engine: "self_hosted_workflow",
    model: "minimax_h3",
    prompt,
    firstFrame,
    lastFrame,
    width: width || size.width,
    height: height || size.height,
    duration: duration || 8,
    seed,
    characterIds,
    continuity,
    chainLastFrame: Boolean(chainLastFrame),
    retryCount: 0,
    maxTechnicalRetries: MAX_TECHNICAL_RETRIES,
    aestheticRetries: MAX_AESTHETIC_RETRIES_DEFAULT,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    workerJobId: null,
    videoPath: null,
    error: null,
    metrics: emptyJobMetrics(),
  }
}

export async function submitJobToWorker(job, {
  env = process.env,
  fetchFn = fetch,
} = {}) {
  const readiness = inspectClipEngineReadiness(env)
  if (!readiness.ready) {
    const detail = readiness.blocks[0]?.detail || readiness.blocks[0]?.code || "video worker not ready"
    const err = blockedConfig("video", detail)
    err.code = readiness.blocks[0]?.code || "VIDEO_WORKER_MISSING"
    throw err
  }
  const worker = videoWorkerConfig(env)
  const res = await fetchFn(`${worker.url}/v1/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${worker.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jobId: job.jobId,
      episodeId: job.episodeId,
      shotId: job.shotId,
      workflowId: "minimax_h3",
      prompt: job.prompt,
      firstFrameUrl: job.firstFrame?.providerUrl || job.firstFrame?.url || null,
      firstFramePath: job.firstFrame?.storagePath || null,
      lastFrameUrl: job.lastFrame?.providerUrl || job.lastFrame?.url || null,
      width: job.width,
      height: job.height,
      duration: job.duration,
      seed: job.seed,
      characterIds: job.characterIds,
      continuity: job.continuity,
      chainLastFrame: job.chainLastFrame,
    }),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { json = null }
  if (!res.ok) {
    const err = new Error(`PROVIDER_ERROR (video): MiniMax worker HTTP ${res.status}`)
    err.code = "PROVIDER_ERROR"
    throw err
  }
  return {
    ...job,
    status: json?.status || JOB_QUEUED,
    workerJobId: json?.jobId || json?.workerJobId || job.jobId,
    updatedAt: new Date().toISOString(),
  }
}

export async function generateClip(input, opts = {}) {
  const job = createVideoJob(input)
  return submitJobToWorker(job, opts)
}

export async function queueEpisodeShots(plan, {
  firstFramesByShot = {},
  env = process.env,
  fetchFn = fetch,
  chainLastFrame = false,
} = {}) {
  const jobs = []
  for (const shot of plan.shots || []) {
    const job = createVideoJob({
      episodeId: plan.episodeId,
      seriesId: plan.seriesId,
      shotId: shot.shotId,
      prompt: shot.videoPrompt || shot.motionPrompt,
      firstFrame: firstFramesByShot[shot.shotId] || null,
      duration: shot.duration,
      characterIds: shot.onScreenCharacterIds,
      continuity: { sceneIndex: shot.sceneIndex, sharedSpace: shot.sharedSpace },
      chainLastFrame,
    })
    jobs.push(await submitJobToWorker(job, { env, fetchFn }))
  }
  return jobs
}

export function rollupEpisodeCost(jobs, { gpuHourRate = null, episodeCount = 1 } = {}) {
  const list = Array.isArray(jobs) ? jobs : []
  const gpuSeconds = list.reduce((sum, job) => sum + Number(job?.metrics?.gpu_seconds || 0), 0)
  const generationSeconds = list.reduce((sum, job) => sum + Number(job?.metrics?.generation_seconds || 0), 0)
  const queueSeconds = list.reduce((sum, job) => sum + Number(job?.metrics?.queue_seconds || 0), 0)
  const clipDuration = list.reduce((sum, job) => sum + Number(job?.duration || job?.metrics?.clip_duration || 0), 0)
  const retryCount = list.reduce((sum, job) => sum + Number(job?.retryCount || job?.metrics?.retry_count || 0), 0)
  const estimatedComputeCost = estimateComputeCost({ gpuSeconds, gpuHourRate })
  const perEpisode = estimatedComputeCost
  const projected50 = estimatedComputeCost == null ? null : Math.round(estimatedComputeCost * (50 / Math.max(1, episodeCount)) * 10000) / 10000
  return {
    shotCount: list.length,
    completed: list.filter((job) => job.status === JOB_COMPLETED).length,
    failed: list.filter((job) => job.status === JOB_FAILED).length,
    gpu_seconds: gpuSeconds || null,
    generation_seconds: generationSeconds || null,
    queue_seconds: queueSeconds || null,
    clip_duration: clipDuration || null,
    retry_count: retryCount,
    gpu_hour_rate: gpuHourRate,
    estimatedComputeCost: perEpisode,
    projectedCost50Episodes: projected50,
    model: list[0]?.model || "minimax_h3",
  }
}

export async function pollWorkerJob(job, { env = process.env, fetchFn = fetch } = {}) {
  const worker = videoWorkerConfig(env)
  if (!worker.url) {
    const err = blockedConfig("video", "VIDEO_WORKER_URL absent")
    err.code = "VIDEO_WORKER_MISSING"
    throw err
  }
  const id = encodeURIComponent(job.workerJobId || job.jobId)
  const res = await fetchFn(`${worker.url}/v1/jobs/${id}`, {
    headers: { Authorization: `Bearer ${worker.token}` },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(`PROVIDER_ERROR (video): MiniMax worker status HTTP ${res.status}`)
    err.code = "PROVIDER_ERROR"
    throw err
  }
  const metrics = { ...job.metrics, ...(json.metrics || {}) }
  metrics.estimatedComputeCost = estimateComputeCost({
    gpuSeconds: metrics.gpu_seconds,
    gpuHourRate: metrics.gpu_hour_rate ?? (Number(env.VIDEO_GPU_HOUR_RATE || 0) || null),
  })
  return {
    ...job,
    status: json.status || job.status,
    videoPath: json.videoPath || json.videoUrl || job.videoPath,
    error: json.error || null,
    metrics,
    updatedAt: new Date().toISOString(),
  }
}
