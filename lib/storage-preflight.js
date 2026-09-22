import { blockedConfig } from "./content-rails.js"
import {
  IMAGES_BUCKET,
  listStorageBuckets,
  createPrivateBucket,
} from "./supabase-storage.js"

export function imagesBucketNotReady(detail) {
  return blockedConfig("image", `IMAGES_BUCKET not ready (${detail})`)
}

export function summarizeBuckets(buckets) {
  return (buckets || []).map((bucket) => ({
    name: bucket.name,
    public: !!bucket.public,
  }))
}

export function chooseImagesBucket(buckets) {
  const names = (buckets || []).map((bucket) => bucket.name)
  if (names.includes(IMAGES_BUCKET)) {
    const meta = buckets.find((bucket) => bucket.name === IMAGES_BUCKET)
    return {
      bucket: IMAGES_BUCKET,
      action: "EXISTED",
      private: meta ? meta.public === false : null,
    }
  }
  return { bucket: IMAGES_BUCKET, action: "CREATE", private: true }
}

export async function inspectImagesStorage({ listFn = listStorageBuckets } = {}) {
  const buckets = await listFn()
  const choice = chooseImagesBucket(buckets)
  return {
    buckets: summarizeBuckets(buckets),
    imagesBucket: choice.bucket,
    action: choice.action,
    private: choice.private,
    ready: choice.action !== "CREATE",
  }
}

export async function ensurePrivateImagesBucket({
  listFn = listStorageBuckets,
  createFn = createPrivateBucket,
} = {}) {
  const inspect = await inspectImagesStorage({ listFn })
  if (inspect.ready) {
    return { ...inspect, created: false }
  }
  await createFn(IMAGES_BUCKET, { public: false, fileSizeLimit: 20 * 1024 * 1024 })
  const after = await inspectImagesStorage({ listFn })
  return {
    ...after,
    action: "CREATED",
    created: true,
    imagesBucket: IMAGES_BUCKET,
    private: true,
    ready: after.ready || after.buckets.some((bucket) => bucket.name === IMAGES_BUCKET),
  }
}

export async function assertImagesBucketReady({ listFn = listStorageBuckets } = {}) {
  const inspect = await inspectImagesStorage({ listFn })
  if (!inspect.ready) {
    throw imagesBucketNotReady(`bucket '${IMAGES_BUCKET}' not found`)
  }
  return inspect
}

export async function runProviderAfterImagesBucketReady(generateFn, { listFn, assertFn = assertImagesBucketReady } = {}) {
  await assertFn(listFn ? { listFn } : {})
  return generateFn()
}
