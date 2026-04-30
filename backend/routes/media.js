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
const allowedMimeTypes = new Set(['audio/mp4', 'audio/x-m4a'])
const allowedExtension = '.m4a'

fs.mkdirSync(env.uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, env.uploadsDir)
  },
  filename(req, file, callback) {
    const extension = path.extname(file.originalname || '').toLowerCase() || allowedExtension
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
    const isAllowedExtension = extension === allowedExtension

    if (isAllowedMime || isAllowedExtension) {
      callback(null, true)
      return
    }

    const error = new Error('Only non-DRM .m4a audio uploads are allowed')
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
