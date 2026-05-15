import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import multer from 'multer'
import { Router } from 'express'
import env from '../config/env.js'
import { asyncHandler } from '../middleware/async-handler.js'
import { requireLocalUser } from '../middleware/require-local-user.js'
import { assert } from '../utils/assert.js'
import {
  createAudioAsset,
  deleteAudioAsset,
  getAudioAssetStorageRecord,
  listAudioAssets,
} from '../services/media/media-service.js'

const router = Router()
const allowedMimeTypes = new Set([
  'audio/mp4',
  'audio/x-m4a',
  'audio/mpeg',
  'audio/mp3',
])
const allowedExtensions = new Set(['.m4a', '.mp3'])

function getFallbackExtensionForMimeType(mimeType) {
  const normalizedMimeType = String(mimeType || '').toLowerCase()

  if (normalizedMimeType === 'audio/mpeg' || normalizedMimeType === 'audio/mp3') {
    return '.mp3'
  }

  if (normalizedMimeType === 'audio/mp4' || normalizedMimeType === 'audio/x-m4a') {
    return '.m4a'
  }

  return '.m4a'
}

fs.mkdirSync(env.uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, env.uploadsDir)
  },
  filename(req, file, callback) {
    const originalExtension = path.extname(file.originalname || '').toLowerCase()
    const extension = allowedExtensions.has(originalExtension)
      ? originalExtension
      : getFallbackExtensionForMimeType(file.mimetype)
    callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`)
  },
})

const upload = multer({
  storage,
  limits: {
    fileSize: env.mediaUploadMaxBytes,
  },
  fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname || '').toLowerCase()
    const mimeType = String(file.mimetype || '').toLowerCase()
    const isAllowedMime = allowedMimeTypes.has(mimeType)
    const isAllowedExtension = allowedExtensions.has(extension)

    if (isAllowedMime || isAllowedExtension) {
      callback(null, true)
      return
    }

    const error = new Error('Only supported local audio files are allowed: .m4a, .mp3')
    error.status = 400
    callback(error)
  },
})

function runUpload(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      next()
      return
    }

    if (error instanceof multer.MulterError) {
      error.status = 400
    }

    next(error)
  })
}

router.use(requireLocalUser)

router.post(
  '/upload',
  runUpload,
  asyncHandler(async (req, res) => {
    assert(req.file, 'file is required')

    const asset = createAudioAsset(req.localUserId, req.file, {
      title: req.body?.title,
      artists: req.body?.artists,
      album: req.body?.album,
      duration_ms: req.body?.duration_ms,
    })

    res.status(201).json({
      asset,
    })
  }),
)

router.get(
  '/assets',
  asyncHandler(async (req, res) => {
    res.json({
      userId: req.localUserId,
      items: listAudioAssets(req.localUserId),
    })
  }),
)

router.get(
  '/assets/:id/stream',
  asyncHandler(async (req, res) => {
    const asset = getAudioAssetStorageRecord(req.localUserId, req.params.id)

    if (!asset) {
      return res.status(404).json({ error: 'Audio asset not found' })
    }

    res.type(asset.mime_type)
    res.sendFile(asset.storage_path)
  }),
)

router.delete(
  '/assets/:id',
  asyncHandler(async (req, res) => {
    const deletedAsset = deleteAudioAsset(req.localUserId, req.params.id)

    if (!deletedAsset) {
      return res.status(404).json({ error: 'Audio asset not found' })
    }

    res.json({
      deleted: true,
      asset: deletedAsset,
    })
  }),
)

export default router
